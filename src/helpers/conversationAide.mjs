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

// Lead-ins that carry no subject matter. Stripped before grouping so that "do you
// know what Kubernetes is" and "are you aware of Kubernetes" land in one group —
// they are the same question asked twice, which is signal worth showing as two
// cards under one heading, not two unrelated cards and not one suppressed one.
const QUESTION_LEAD_IN =
  /^(?:so\s+|and\s+|but\s+|ok(?:ay)?\s+|well\s+)*(?:do|did|does|have|has|had|are|is|was|were|can|could|would|will|-)?\s*(?:you|we|they|u)?\s*(?:happen\s+to\s+)?(?:know|aware\s+of|heard\s+of|hear\s+about|remember|recall|realize|realise|think|reckon|understand|get)\b(?:\s+(?:of|about|if|whether|that|what|how|why|when|where|who|which))?\s*/i;

const GROUPING_STOPWORDS = new Set([
  "a",
  "about",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "like",
  "may",
  "me",
  "might",
  "much",
  "must",
  "my",
  "of",
  "on",
  "or",
  "our",
  "out",
  "over",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "thing",
  "this",
  "those",
  "to",
  "up",
  "us",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "whether",
  "which",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

function normalizeQuestion(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?.!\s]+$/g, "")
    .toLocaleLowerCase();
}

// The grouping key is deliberately lossy: strip the interrogative lead-in, drop
// stopwords, keep the content words, sort them. It exists only to decide which
// cards nest under which heading. It never decides whether a card is shown —
// every detected question is always shown and always persisted.
function questionGroupKey(text) {
  const normalized = normalizeQuestion(text)
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const withoutLeadIn = normalized.replace(QUESTION_LEAD_IN, "").trim() || normalized;
  const words = withoutLeadIn
    .split(" ")
    .map((word) => word.replace(/^[-']+|[-']+$/g, ""))
    .filter((word) => word && !GROUPING_STOPWORDS.has(word))
    .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word));
  const content = words.length ? words : withoutLeadIn.split(" ").filter(Boolean);
  return [...new Set(content)].sort().join(" ") || normalized;
}

// Local reading of what came back after a question.
//
// This exists because the classifier is a small local model (Qwen 1.5B by
// default) being asked for exact six-key JSON *with a calibrated confidence*.
// It is good enough to refine a verdict and far too weak to be the only source
// of one: when it emits malformed JSON or an unconfident number, a card that
// should have resolved sits at `asked` forever, and a question somebody plainly
// answered with "no idea" never opens a search.
//
// So the outcome is decided here, from the words people actually said, and the
// model only gets to sharpen it. Denial and hedging are formulaic in every
// language this ships with, which is exactly what pattern matching is for.
const DENIAL =
  /\b(?:no|nope|nah)\b|\b(?:i|we)\s+(?:really\s+)?(?:do\s?n[o']?t|don't|never)\s+(?:know|recall|remember)\b|\bno\s+(?:idea|clue)\b|\bnever\s+(?:heard|looked|checked)\b|\bnot\s+sure\s+(?:at\s+all|honestly)\b|\bcan'?t\s+remember\b|\bnobody\s+(?:knows|has)\b/i;

const HEDGE =
  /\b(?:i\s+think|i\s+believe|i\s+guess|probably|maybe|perhaps|possibly|sort\s+of|kind\s+of|roughly|something\s+like|not\s+sure|i'?m\s+not\s+certain|might\s+be|could\s+be)\b/i;

// Words that carry no answer, so an utterance made only of these is not a reply.
const BACKCHANNEL =
  /^(?:mm+[-\s]?hm*|mhm+|uh[-\s]?huh|uh+|um+|hmm+|right|okay|ok|yeah|yep|yup|sure|got\s+it|i\s+see|makes\s+sense)[\s.!?,]*$/i;

function assessResponseLocally(followingContext) {
  const replies = (Array.isArray(followingContext) ? followingContext : [])
    .map((item) => String(item?.text || "").trim())
    .filter((text) => text && !BACKCHANNEL.test(text));

  if (!replies.length) return { outcome: "silence", confidence: 0.8 };

  const joined = replies.join(" ");
  // Denial wins over hedging: "No, I'm not sure" is a denial with a hedge in it.
  if (DENIAL.test(joined)) return { outcome: "denied", confidence: 0.85 };
  if (HEDGE.test(joined)) return { outcome: "uncertain", confidence: 0.8 };
  // Something substantive was said. Short replies are weaker evidence of a real
  // answer than long ones, so they land as uncertain rather than answered.
  if (joined.split(/\s+/).length < 4) return { outcome: "uncertain", confidence: 0.6 };
  return { outcome: "answered", confidence: 0.75 };
}

// Maps a classifier verdict onto the card/graph outcome vocabulary (DESIGN.md §4).
//
// Only `denied` opens a browser. Detection is allowed to be generous — an extra
// card costs a glance — but opening a tab mid-conversation is disruptive enough
// that it demands a *confirmed negative*: somebody was actually asked and
// actually said they did not know. Silence is not a negative (the room may have
// simply moved on), and a hedge is not a negative (there may well be an answer
// in it). Both leave a card you can search by hand.
function outcomeForAssessment(assessment, confidenceThreshold) {
  if (!assessment) return "silence";
  if (assessment.isAnswered) {
    return assessment.confidence >= confidenceThreshold ? "answered" : "uncertain";
  }
  if (assessment.reason === "denied_knowledge") {
    // A low-confidence denial is not confirmed, so it stays a card and nothing
    // more. This threshold is the whole guard against opening tabs at random.
    return assessment.confidence >= confidenceThreshold ? "denied" : "uncertain";
  }
  if (assessment.reason === "silence") return "silence";
  return "uncertain";
}

// The one outcome that reaches the network without being asked to.
const AUTO_SEARCH_OUTCOMES = new Set(["denied"]);

// Pulls just the question out of a longer turn.
//
// People do not speak in tidy single-clause utterances. A finalized segment is
// often a minute of context with the actual question at the very end — and
// quoting the whole ramble on a card makes it unreadable and makes the search
// query useless. Take the last sentence that is actually interrogative.
function extractQuestionSentence(text) {
  const value = String(text || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!value) return "";
  // Keep the delimiters so "?" survives to mark which sentence was the question.
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length < 2) return value;

  for (let i = sentences.length - 1; i >= 0; i -= 1) {
    const sentence = sentences[i];
    if (sentence.includes("?") || QUESTION_PREFIX.test(sentence)) {
      // A trailing "right?" or "you know?" is a tag, not the question — fold the
      // preceding sentence back in so the card still says something.
      if (sentence.split(" ").length <= 2 && i > 0) {
        return `${sentences[i - 1]} ${sentence}`.trim();
      }
      return sentence;
    }
  }
  return value;
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

// Runs one recording's question detection.
//
// Two phases, deliberately decoupled (DESIGN.md §9.2):
//
//   1. Detection is local, synchronous, and total. The instant a finalized
//      utterance looks like a question, a card exists. No model call, no network,
//      no waiting to see whether anyone answers. Nothing is ever deduplicated or
//      rate-limited away — a question asked three times produces three cards,
//      because re-asking is how people mark what matters.
//   2. Judgement arrives later and *updates the same card*. It decides the
//      outcome and, for anything but `answered`, opens the search.
//
// Everything detected is persisted, whatever the UI chooses to nest or collapse.
class ConversationAideSession {
  constructor(options) {
    this.noteId = options.noteId;
    this.classify = options.classify;
    this.insertEvent = options.insertEvent || (async () => null);
    this.updateEvent = options.updateEvent || (async () => null);
    this.onCard = options.onCard || (() => {});
    this.onCardRemoved = options.onCardRemoved || (() => {});
    this.openSearch = options.openSearch || (async () => false);
    this.autoSearch = options.autoSearch ?? true;
    this.onDiagnostic = options.onDiagnostic || (() => {});
    this.confidenceThreshold = options.confidenceThreshold ?? 0.75;
    this.silenceDelayMs = options.silenceDelayMs ?? 8000;
    this.now = options.now || Date.now;
    this.setTimer = options.setTimer || setTimeout;
    this.clearTimer = options.clearTimer || clearTimeout;
    this.staged = null;
    this.timer = null;
    this.utterances = [];
    this.cards = new Map();
    this.groupCounts = new Map();
    this.closed = false;
    this.evaluation = Promise.resolve();
    this.persistence = Promise.resolve();
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
      this._emitCard(utterance);
      this._stage(utterance);
    }
  }

  // A card can already be on screen when its segment is retracted, because cards
  // appear before the transcript settles. Withdrawing it is therefore part of the
  // normal path, not an edge case.
  onRetracted(segmentId) {
    const id = String(segmentId || "");
    this.utterances = this.utterances.filter((item) => item.id !== id);
    const card = this.cards.get(id);
    if (card) {
      this.cards.delete(id);
      const remaining = (this.groupCounts.get(card.groupKey) ?? 1) - 1;
      if (remaining > 0) this.groupCounts.set(card.groupKey, remaining);
      else this.groupCounts.delete(card.groupKey);
      this.onCardRemoved(card.id);
    }
    if (this.staged?.id === id) this._clearStage();
  }

  async shutdown() {
    this.closed = true;
    this._clearStage();
    await this.evaluation;
    await this.persistence;
  }

  // Phase 1. Synchronous by contract: the card is handed to the UI before this
  // returns, and the database write is chased asynchronously afterwards.
  _emitCard(utterance) {
    // The card shows the question, not the paragraph it arrived in.
    const question = extractQuestionSentence(utterance.text);
    const groupKey = questionGroupKey(question);
    const occurrence = (this.groupCounts.get(groupKey) ?? 0) + 1;
    this.groupCounts.set(groupKey, occurrence);
    const card = {
      id: utterance.id,
      noteId: this.noteId,
      question,
      state: "asked",
      groupKey,
      occurrence,
      searched: false,
      eventId: null,
      createdAt: this.now(),
    };
    this.cards.set(utterance.id, card);
    this.onCard({ ...card });

    this.persistence = this.persistence
      .then(async () => {
        const event = await this.insertEvent({
          noteId: this.noteId,
          kind: "question",
          parentEventId: null,
          segmentIds: [utterance.id],
          text: question,
          metadata: { state: "asked", groupKey, occurrence },
        });
        const stored = this.cards.get(utterance.id);
        if (stored) stored.eventId = event?.id ?? event ?? null;
      })
      .catch((error) => this.onDiagnostic("question_persist_failed", error));
  }

  _updateCard(segmentId, patch) {
    const card = this.cards.get(segmentId);
    if (!card) return null;
    Object.assign(card, patch);
    this.onCard({ ...card });
    return card;
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

  // Resolves a card without the classifier at all — used whenever the model
  // fails, times out, or returns something off-contract. Before this existed such
  // a card sat at `asked` for the rest of the conversation and a plainly denied
  // question never opened a search, which read as the feature being broken rather
  // than the model being small.
  async _resolveLocally(candidate, followingContext, trigger) {
    if (this.closed) return;
    await this.persistence;
    const card = this.cards.get(candidate.id);
    if (!card) return;
    const local = assessResponseLocally(followingContext);
    this._updateCard(candidate.id, { state: local.outcome, confidence: local.confidence });

    if (card.eventId != null) {
      await this.updateEvent(card.eventId, {
        state: local.outcome,
        groupKey: card.groupKey,
        occurrence: card.occurrence,
        confidence: local.confidence,
        source: "local",
      });
    }
    await this.insertEvent({
      noteId: this.noteId,
      kind: "response",
      parentEventId: card.eventId,
      segmentIds: followingContext.map((item) => item.id),
      text: followingContext.map((item) => item.text).join(" ") || "",
      metadata: { reason: local.outcome, trigger, outcome: local.outcome, source: "local" },
    });
    if (local.outcome === "answered") return;

    // The question text is the best search query available without the model.
    const query = extractQuestionSentence(candidate.text);
    const suggestionEvent = await this.insertEvent({
      noteId: this.noteId,
      kind: "search_suggestion",
      parentEventId: card.eventId,
      segmentIds: [candidate.id],
      text: query,
      metadata: {
        query,
        confidence: local.confidence,
        reason: local.outcome,
        state: "shown",
        source: "local",
        auto: this.autoSearch && AUTO_SEARCH_OUTCOMES.has(local.outcome),
      },
    });
    const suggestionId = suggestionEvent?.id ?? suggestionEvent ?? null;
    this._updateCard(candidate.id, { suggestionId, query });
    if (!this.autoSearch || !AUTO_SEARCH_OUTCOMES.has(local.outcome)) return;
    try {
      const opened = await this.openSearch({ eventId: suggestionId, question: query, query });
      if (opened !== false) this._updateCard(candidate.id, { searched: true });
    } catch (error) {
      this.onDiagnostic("auto_search_failed", error);
    }
  }

  // Phase 2. Never creates a card — it only resolves one that is already on
  // screen. A verdict that arrives after the card was retracted is dropped.
  async _evaluate(candidate, followingContext, trigger) {
    if (this.closed || !this.cards.has(candidate.id)) return;

    // No classifier configured at all: resolve locally and say nothing about it.
    //
    // This is the ordinary case, not a degraded one. Detection is local pattern
    // matching by design (CLAUDE.md, first question rule) and the local reading
    // of the reply is the *primary* verdict (fourth rule) — the model only
    // refines. Routing this through the failure path instead would work, but it
    // would report `classifier_failed` once per question for a model the user
    // never asked for, which is a diagnostic that means the opposite of what it
    // says.
    if (!this.classify) {
      await this._resolveLocally(candidate, followingContext, trigger);
      return;
    }

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
      await this._resolveLocally(candidate, followingContext, trigger);
      return;
    }
    if (this.closed || !this.cards.has(candidate.id)) return;
    assessment = typeof assessment === "string" ? parseQuestionAssessment(assessment) : assessment;
    if (!assessment || !parseQuestionAssessment(JSON.stringify(assessment))) {
      this.onDiagnostic("malformed_classifier_output");
      await this._resolveLocally(candidate, followingContext, trigger);
      return;
    }

    // The local detector is permissive by design so nothing is missed, and the
    // classifier withdraws the false positives ("how's the weather?"). It only
    // gets to do that when it is *confident*: a card appearing and vanishing is
    // worse than a card that stays, and an unconfident 1.5B model will call real
    // questions non-factual often enough to make the rail flicker.
    if (!assessment.isFactualQuestion && assessment.confidence >= this.confidenceThreshold) {
      const card = this.cards.get(candidate.id);
      this.cards.delete(candidate.id);
      if (card) this.onCardRemoved(card.id);
      return;
    }

    await this.persistence;
    const card = this.cards.get(candidate.id);
    if (!card) return;
    // The local reading of the reply is the primary verdict; the model may only
    // override it when it is confident. This keeps outcomes (and therefore
    // auto-search) working even when the classifier is weak, malformed, or slow.
    const local = assessResponseLocally(followingContext);
    const modelOutcome = outcomeForAssessment(assessment, this.confidenceThreshold);
    const outcome =
      assessment.confidence >= this.confidenceThreshold ? modelOutcome : local.outcome;
    this._updateCard(candidate.id, {
      state: outcome,
      question: assessment.normalizedQuestion || card.question,
      confidence: assessment.confidence,
    });

    const questionEventId = card.eventId;
    if (questionEventId != null) {
      await this.updateEvent(questionEventId, {
        state: outcome,
        groupKey: card.groupKey,
        occurrence: card.occurrence,
        confidence: assessment.confidence,
        normalizedQuestion: assessment.normalizedQuestion,
      });
    }
    await this.insertEvent({
      noteId: this.noteId,
      kind: "response",
      parentEventId: questionEventId,
      segmentIds: followingContext.map((item) => item.id),
      text: followingContext.map((item) => item.text).join(" ") || "",
      metadata: { reason: assessment.reason, trigger, outcome },
    });

    // Answered questions are a record, nothing more.
    if (outcome === "answered") return;

    const suggestionEvent = await this.insertEvent({
      noteId: this.noteId,
      kind: "search_suggestion",
      parentEventId: questionEventId,
      segmentIds: [candidate.id, ...followingContext.map((item) => item.id)],
      text: assessment.searchQuery,
      metadata: {
        query: assessment.searchQuery,
        confidence: assessment.confidence,
        reason: assessment.reason,
        state: "shown",
        auto: this.autoSearch && AUTO_SEARCH_OUTCOMES.has(outcome),
      },
    });
    const suggestionId = suggestionEvent?.id ?? suggestionEvent ?? null;
    this._updateCard(candidate.id, { suggestionId, query: assessment.searchQuery });
    // Every unanswered question keeps a searchable suggestion; only a confirmed
    // denial spends it automatically.
    if (!this.autoSearch || !AUTO_SEARCH_OUTCOMES.has(outcome)) return;

    try {
      const opened = await this.openSearch({
        eventId: suggestionId,
        question: assessment.normalizedQuestion,
        query: assessment.searchQuery,
      });
      if (opened === false) return;
      this._updateCard(candidate.id, { searched: true });
    } catch (error) {
      this.onDiagnostic("auto_search_failed", error);
    }
  }
}

export {
  AUTO_SEARCH_OUTCOMES,
  assessResponseLocally,
  extractQuestionSentence,
  ConversationAideSession,
  buildClassifierPrompt,
  buildSearchUrl,
  isQuestionCandidate,
  normalizeQuestion,
  outcomeForAssessment,
  parseQuestionAssessment,
  questionGroupKey,
  validateSearchBaseUrl,
  validateSearchUrl,
};
