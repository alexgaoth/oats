const QUESTION_PREFIX =
  /^(?:what|why|how|which|who|where|when|do\s+you\s+know|can\s+you\s+(?:explain|tell)|could\s+you\s+(?:explain|tell))\b/i;
const QUESTION_ANYWHERE =
  /\b(?:what|why|how|which|who|where|when|do\s+you\s+know|can\s+you\s+explain)\b/i;
const COMMAND_PREFIX =
  /^(?:please\s+)?(?:open|close|send|write|type|create|delete|remove|add|set|turn|start|stop|record|search)\b/i;
const CASUAL_OR_RHETORICAL =
  /^(?:how are you|what's up|whats up|how's it going|how is it going|who cares|why bother|what can you do)[?.!\s]*$/i;

const REASONS = new Set([
  "denied_knowledge",
  "uncertain_response",
  "silence",
  "answered",
  "not_factual",
]);

function normalizeQuestion(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?.!\s]+$/g, "")
    .toLocaleLowerCase();
}

function isQuestionCandidate(text) {
  const value = String(text || "")
    .trim()
    .replace(/\s+/g, " ");
  if (value.length < 4 || value.length > 600) return false;
  if (CASUAL_OR_RHETORICAL.test(value) || COMMAND_PREFIX.test(value)) return false;
  if (/^(?:uh+|um+|hmm+|okay|ok|yes|no)[?.!\s]*$/i.test(value)) return false;
  return value.includes("?") || QUESTION_PREFIX.test(value) || QUESTION_ANYWHERE.test(value);
}

function parseQuestionAssessment(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const requiredKeys = new Set([
    "isFactualQuestion",
    "isAnswered",
    "normalizedQuestion",
    "searchQuery",
    "confidence",
    "reason",
  ]);
  const keys = Object.keys(parsed);
  if (keys.length !== requiredKeys.size || keys.some((key) => !requiredKeys.has(key))) return null;
  if (typeof parsed.isFactualQuestion !== "boolean" || typeof parsed.isAnswered !== "boolean") {
    return null;
  }
  if (typeof parsed.normalizedQuestion !== "string" || !parsed.normalizedQuestion.trim()) {
    return null;
  }
  if (typeof parsed.searchQuery !== "string" || !parsed.searchQuery.trim()) return null;
  if (
    typeof parsed.confidence !== "number" ||
    !Number.isFinite(parsed.confidence) ||
    parsed.confidence < 0 ||
    parsed.confidence > 1
  ) {
    return null;
  }
  if (!REASONS.has(parsed.reason)) return null;
  return {
    isFactualQuestion: parsed.isFactualQuestion,
    isAnswered: parsed.isAnswered,
    normalizedQuestion: parsed.normalizedQuestion.trim(),
    searchQuery: parsed.searchQuery.trim(),
    confidence: parsed.confidence,
    reason: parsed.reason,
  };
}

function validateSearchBaseUrl(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Invalid search base URL");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error("Search base URL must be a credential-free HTTPS URL");
  }
  return url;
}

function buildSearchUrl(query, baseUrl = "https://www.google.com/search") {
  if (typeof query !== "string" || !query.trim()) throw new Error("Search query is required");
  const url = validateSearchBaseUrl(baseUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("q", query.trim());
  return url.toString();
}

function validateSearchUrl(urlValue, baseUrl = "https://www.google.com/search") {
  const base = validateSearchBaseUrl(baseUrl);
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname === base.hostname &&
    url.port === base.port &&
    !url.username &&
    !url.password
  );
}

function buildClassifierPrompt(candidate, context) {
  const utterances = context
    .map((item) => `${item.id === candidate.id ? "QUESTION" : "CONTEXT"}: ${item.text}`)
    .join("\n");
  return `Assess whether the QUESTION is a factual question and whether the later context answers it.
Return only one JSON object with exactly these fields:
{"isFactualQuestion":boolean,"isAnswered":boolean,"normalizedQuestion":string,"searchQuery":string,"confidence":number,"reason":"denied_knowledge"|"uncertain_response"|"silence"|"answered"|"not_factual"}
Use reason "silence" when there is no later response. Confidence must be between 0 and 1.

${utterances}`;
}

class ConversationAideSession {
  constructor(options) {
    this.noteId = options.noteId;
    this.classify = options.classify;
    this.insertEvent = options.insertEvent || (async () => null);
    this.showSuggestion = options.showSuggestion || (async () => {});
    this.onDiagnostic = options.onDiagnostic || (() => {});
    this.confidenceThreshold = options.confidenceThreshold ?? 0.75;
    this.silenceDelayMs = options.silenceDelayMs ?? 8000;
    this.cooldownMs = options.cooldownMs ?? 30000;
    this.candidateDedupeMs = options.candidateDedupeMs ?? 30000;
    this.now = options.now || Date.now;
    this.setTimer = options.setTimer || setTimeout;
    this.clearTimer = options.clearTimer || clearTimeout;
    this.staged = null;
    this.timer = null;
    this.utterances = [];
    this.suggested = new Set();
    this.seenCandidates = new Map();
    this.candidateKeysById = new Map();
    this.lastSuggestionAt = -Infinity;
    this.closed = false;
    this.evaluation = Promise.resolve();
  }

  onFinalized(segment) {
    if (this.closed || !segment || !segment.id || !String(segment.text || "").trim()) return;
    const utterance = { id: String(segment.id), text: String(segment.text).trim() };
    this.utterances.push(utterance);
    if (this.utterances.length > 8) this.utterances.shift();

    const previous = this.staged;
    if (previous && previous.id !== utterance.id) {
      this._clearStage();
      this._queueEvaluation(previous, "next_utterance");
    }
    if (isQuestionCandidate(utterance.text)) {
      const key = normalizeQuestion(utterance.text);
      const seenAt = this.seenCandidates.get(key);
      if (seenAt == null || this.now() - seenAt >= this.candidateDedupeMs) {
        this.seenCandidates.set(key, this.now());
        this.candidateKeysById.set(utterance.id, key);
        this._stage(utterance);
      }
    }
  }

  onRetracted(segmentId) {
    const id = String(segmentId || "");
    this.utterances = this.utterances.filter((item) => item.id !== id);
    const key = this.candidateKeysById.get(id);
    if (key) this.seenCandidates.delete(key);
    this.candidateKeysById.delete(id);
    if (this.staged?.id === id) this._clearStage();
  }

  async shutdown() {
    this.closed = true;
    this._clearStage();
    await this.evaluation;
  }

  _stage(candidate) {
    this._clearStage();
    this.staged = candidate;
    this.timer = this.setTimer(() => {
      const pending = this.staged;
      this._clearStage();
      if (pending) this._queueEvaluation(pending, "silence");
    }, this.silenceDelayMs);
  }

  _clearStage() {
    if (this.timer != null) this.clearTimer(this.timer);
    this.timer = null;
    this.staged = null;
  }

  _queueEvaluation(candidate, trigger) {
    // The response window is the utterances that follow the question, never the
    // ones before it: preceding chatter is not an answer, and persisting it as a
    // "response" event (or feeding it to the classifier as "later context")
    // corrupts answer detection and the stored conversation graph. On silence
    // the candidate is the last utterance, so this correctly yields no context.
    const index = this.utterances.findIndex((item) => item.id === candidate.id);
    const context = index >= 0 ? this.utterances.slice(index + 1).slice(-3) : [];
    this.evaluation = this.evaluation
      .then(() => this._evaluate(candidate, context, trigger))
      .catch((error) => this.onDiagnostic("evaluation_failed", error));
  }

  async _evaluate(candidate, followingContext, trigger) {
    if (this.closed) return;
    let assessment;
    try {
      const raw = await this.classify({
        candidate,
        context: [candidate, ...followingContext],
        prompt: buildClassifierPrompt(candidate, [candidate, ...followingContext]),
      });
      assessment = typeof raw === "string" ? parseQuestionAssessment(raw) : raw;
    } catch (error) {
      this.onDiagnostic("classifier_failed", error);
      return;
    }
    if (this.closed) return;
    assessment = typeof assessment === "string" ? parseQuestionAssessment(assessment) : assessment;
    if (!assessment || !parseQuestionAssessment(JSON.stringify(assessment))) {
      this.onDiagnostic("malformed_classifier_output");
      return;
    }
    if (!assessment.isFactualQuestion) return;

    const questionEvent = await this.insertEvent({
      noteId: this.noteId,
      kind: "question",
      parentEventId: null,
      segmentIds: [candidate.id],
      text: assessment.normalizedQuestion,
      metadata: { confidence: assessment.confidence },
    });
    await this.insertEvent({
      noteId: this.noteId,
      kind: "response",
      parentEventId: questionEvent?.id ?? questionEvent ?? null,
      segmentIds: followingContext.map((item) => item.id),
      text: followingContext.map((item) => item.text).join(" ") || "",
      metadata: { reason: assessment.reason, trigger },
    });

    const key = normalizeQuestion(assessment.normalizedQuestion);
    const now = this.now();
    if (
      assessment.isAnswered ||
      assessment.confidence < this.confidenceThreshold ||
      !key ||
      this.suggested.has(key) ||
      now - this.lastSuggestionAt < this.cooldownMs
    ) {
      return;
    }

    const suggestionEvent = await this.insertEvent({
      noteId: this.noteId,
      kind: "search_suggestion",
      parentEventId: questionEvent?.id ?? questionEvent ?? null,
      segmentIds: [candidate.id, ...followingContext.map((item) => item.id)],
      text: assessment.searchQuery,
      metadata: {
        query: assessment.searchQuery,
        confidence: assessment.confidence,
        reason: assessment.reason,
        state: "shown",
      },
    });
    this.suggested.add(key);
    this.lastSuggestionAt = now;
    await this.showSuggestion({
      eventId: suggestionEvent?.id ?? suggestionEvent,
      question: assessment.normalizedQuestion,
      query: assessment.searchQuery,
    });
  }
}

export {
  ConversationAideSession,
  buildClassifierPrompt,
  buildSearchUrl,
  isQuestionCandidate,
  normalizeQuestion,
  parseQuestionAssessment,
  validateSearchBaseUrl,
  validateSearchUrl,
};
