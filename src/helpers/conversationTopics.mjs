// Topic and thread tracking for a live conversation.
//
// This is the data model underneath both the open-thread stack (DESIGN.md §9.3)
// and the topic graph (DESIGN.md §9.4). Neither widget is worth more than the
// detector below, so the detector is deliberately boring: lexical overlap over
// finalized utterances, no model call, no network, cheap enough to run on every
// utterance for an hour.
//
// The three things it produces:
//   - **topics**, with how much of the conversation each one held,
//   - **transitions** between them, which are the graph's edges — including the
//     back-edge when a conversation returns to something it dropped, the single
//     most interesting thing the graph can show,
//   - **thread state** (live / open / resolved / dropped), which is the only
//     reason the stack exists.
//
// Kept as dependency-free ESM so it unit-tests under node:test like the rest of
// the conversation core.

const STOPWORDS = new Set([
  "a",
  "about",
  "actually",
  "after",
  "again",
  "all",
  "also",
  "am",
  "an",
  "and",
  "any",
  "anyway",
  "are",
  "as",
  "at",
  "back",
  "be",
  "because",
  "been",
  "before",
  "being",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "done",
  "down",
  "for",
  "from",
  "get",
  "getting",
  "go",
  "going",
  "good",
  "got",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "him",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "kind",
  "know",
  "like",
  "little",
  "lot",
  "make",
  "makes",
  "many",
  "maybe",
  "me",
  "mean",
  "might",
  "more",
  "most",
  "much",
  "my",
  "need",
  "no",
  "not",
  "now",
  "of",
  "off",
  "ok",
  "okay",
  "on",
  "one",
  "only",
  "or",
  "other",
  "our",
  "out",
  "over",
  "really",
  "right",
  "said",
  "say",
  "see",
  "she",
  "should",
  "so",
  "some",
  "something",
  "sort",
  "still",
  "such",
  "sure",
  "take",
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
  "things",
  "think",
  "this",
  "those",
  "though",
  "thought",
  "through",
  "to",
  "too",
  "up",
  "us",
  "use",
  "very",
  "want",
  "was",
  "way",
  "we",
  "well",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "would",
  "yeah",
  "yes",
  "yet",
  "you",
  "your",
]);

function contentWords(text) {
  return String(text || "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[-']+|[-']+$/g, ""))
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
    .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word));
}

// Jaccard overlap. Symmetric and bounded — exported because it is the honest
// measure of "how alike are these two utterances".
function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

// How much of *this utterance* is already part of that topic.
//
// Deliberately asymmetric, and not Jaccard: a topic's vocabulary grows with every
// utterance absorbed into it, so a symmetric measure decays as a topic matures
// and the conversation stops recognising its own long-running threads. Measuring
// coverage of the utterance instead keeps a five-minute topic exactly as
// attractive as a five-second one — which is what makes returning to an earlier
// thread detectable at all.
function coverage(utteranceBag, topicBag) {
  if (!utteranceBag.size || !topicBag.size) return 0;
  let shared = 0;
  for (const word of utteranceBag) if (topicBag.has(word)) shared += 1;
  return shared / utteranceBag.size;
}

// A topic is named after what it actually kept talking about — the most repeated
// content words — not after whichever sentence happened to open it. Naming from
// the first utterance produces labels like "don't i've never", because the
// sentence that starts a thread is often an aside.
//
// *Which* two words is a frequency question; what **order** to say them in is
// not. Emitting them most-frequent-first scrambles every multi-word subject the
// moment the second word is said more often than the first — a conversation
// about onboarding flow was labelled "flow onboarding" — and a scrambled label
// reads as a bug in the transcription rather than as a summary. `counts` is
// insertion-ordered by first appearance, so restoring that order restores the
// phrase people actually used.
function topicLabel(counts, fallback) {
  const order = [...counts.keys()];
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([word]) => word)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return ranked.join(" ") || String(fallback || "").slice(0, 40) || "untitled";
}

// Tracks the conversation's topics as utterances arrive.
//
// A topic stays live while utterances keep resembling it. When an utterance
// resembles an *earlier* topic more than the live one, that is a return — the
// edge worth drawing. When it resembles nothing, a new topic starts and the
// previous one is left open.
class ConversationTopicTracker {
  constructor(options = {}) {
    // Fractions of the *utterance's* content words that must already belong to a
    // topic (see `coverage`). Continuing is cheap, so it is generous; declaring a
    // return to an older thread is a strong claim, so it demands more.
    this.continueThreshold = options.continueThreshold ?? 0.2;
    this.returnThreshold = options.returnThreshold ?? 0.45;
    // A topic nobody has come back to for this long has gone cold.
    this.dropAfterMs = options.dropAfterMs ?? 180000;
    // Short utterances — "No, I don't", "Probably, yes" — are answers, not new
    // subjects. They fold into whatever is being discussed instead of shattering
    // the graph into a node per sentence.
    this.minWords = options.minWords ?? 3;
    this.now = options.now || Date.now;
    this.topics = [];
    this.transitions = [];
    this.currentId = null;
    this.nextId = 1;
    // An utterance that matches nothing is held here for one turn rather than
    // immediately becoming a topic. See `onUtterance`.
    this.pending = null;
  }

  // Feeds one finalized utterance. Returns the topic it landed in, or null when
  // the utterance carried too little content to place (backchannel, "mm-hm").
  onUtterance(utterance) {
    const text = String(utterance?.text || "").trim();
    if (!text) return null;
    const words = contentWords(text);
    if (words.length < this.minWords) return null;
    const bag = new Set(words);
    const at = Number.isFinite(utterance.at) ? utterance.at : this.now();

    // One utterance that matches nothing is an aside — a joke, a tangent, an
    // answer phrased in completely different words ("two weeks if nobody touches
    // it"). Two in a row that match *each other* is a genuine change of subject.
    // Waiting one turn before committing is the single biggest thing keeping the
    // graph from shattering into one node per sentence.
    const pending = this.pending;
    if (pending) {
      this.pending = null;
      if (coverage(bag, pending.bag) >= this.continueThreshold) {
        const topic = this._newTopic(pending.at);
        this._move(topic, pending.at, pending.utterance, pending.bag, pending.words, "new");
        this._absorb(topic, at, utterance, bag, words);
        return topic;
      }
      // The aside stays with whatever was being discussed at the time.
      const host = this.topics.find((topic) => topic.id === this.currentId);
      if (host) this._absorb(host, pending.at, pending.utterance, pending.bag, pending.words);
    }

    const current = this.topics.find((topic) => topic.id === this.currentId) || null;
    const currentScore = current ? coverage(bag, current.bag) : 0;

    let best = null;
    let bestScore = 0;
    for (const topic of this.topics) {
      if (topic.id === this.currentId) continue;
      const score = coverage(bag, topic.bag);
      if (score > bestScore) {
        best = topic;
        bestScore = score;
      }
    }

    // A clear return to something discussed earlier beats merely continuing. The
    // margin matters: without it, adjacent topics that share a word or two would
    // ping-pong and the graph would fill with meaningless edges.
    if (best && bestScore >= this.returnThreshold && bestScore > currentScore) {
      this._move(best, at, utterance, bag, words, "return");
      return best;
    }
    if (current && currentScore >= this.continueThreshold) {
      this._absorb(current, at, utterance, bag, words);
      return current;
    }

    // Nothing matched. Hold it for one turn instead of committing a topic. The
    // very first utterance of a conversation has nothing to belong to, so it
    // starts a topic outright rather than being held.
    if (!current) {
      const topic = this._newTopic(at);
      this._move(topic, at, utterance, bag, words, "new");
      return topic;
    }
    this.pending = { utterance, bag, words, at };
    return null;
  }

  _newTopic(at) {
    const topic = {
      id: this.nextId++,
      label: "",
      bag: new Set(),
      counts: new Map(),
      words: [],
      firstAt: at,
      lastAt: at,
      durationMs: 0,
      utteranceIds: [],
      returns: 0,
      resolved: false,
    };
    this.topics.push(topic);
    return topic;
  }

  // Folds any held-back aside into the current topic. Called before reading the
  // stack or the graph so a trailing aside is never lost or left dangling.
  _flushPending() {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    const host = this.topics.find((topic) => topic.id === this.currentId);
    if (host) this._absorb(host, pending.at, pending.utterance, pending.bag, pending.words);
  }

  _absorb(topic, at, utterance, bag, words) {
    if (at > topic.lastAt) topic.durationMs += at - topic.lastAt;
    topic.lastAt = Math.max(topic.lastAt, at);
    topic.utteranceIds.push(String(utterance.id));
    for (const word of bag) {
      topic.bag.add(word);
      topic.counts.set(word, (topic.counts.get(word) ?? 0) + 1);
    }
    // Ordered by how often each word was actually used, most-used first. This is
    // not cosmetic: consumers (the graph, cross-conversation matching) take only
    // the leading words as a topic's fingerprint, and insertion order would hand
    // them whatever was said first rather than what the topic is about.
    topic.words = [...topic.counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([word]) => word);
    // Re-derived on every utterance: a topic's name should track what it turned
    // out to be about, not what its first sentence happened to mention.
    topic.label = topicLabel(topic.counts, words.join(" "));
  }

  _move(topic, at, utterance, bag, words, kind) {
    const from = this.currentId;
    if (from != null && from !== topic.id) {
      const existing = this.transitions.find(
        (transition) => transition.from === from && transition.to === topic.id
      );
      if (existing) existing.weight += 1;
      else this.transitions.push({ from, to: topic.id, weight: 1, kind });
      if (kind === "return") topic.returns += 1;
    }
    this.currentId = topic.id;
    this._absorb(topic, at, utterance, bag, words);
  }

  // Marks resolved the topic that contains a given utterance. Called when a
  // question is answered — an answered question is the clearest signal a thread
  // reached a conclusion.
  //
  // It resolves the topic the *question* belonged to, not the live one: the
  // verdict arrives seconds later and the room may have already moved on, so
  // resolving whatever is current would close the wrong thread and leave the
  // real one nagging in the stack forever.
  resolveTopicForUtterance(utteranceId) {
    const id = String(utteranceId ?? "");
    if (!id) return null;
    const topic = this.topics.find((candidate) => candidate.utteranceIds.includes(id));
    if (!topic) return null;
    topic.resolved = true;
    return topic;
  }

  // A topic that never got past a single utterance was a passing remark, not a
  // thread. Folding it into whatever the conversation moved to next keeps the
  // graph legible (and keeps its questions reachable, since the utterance goes
  // with it) instead of littering the canvas with one-sentence nodes.
  _condensed() {
    const kept = [];
    const merged = new Map();
    for (const topic of this.topics) {
      const isStub = topic.utteranceIds.length < 2 && this.topics.length > 1;
      if (isStub && topic.id !== this.currentId) {
        const successor = this.transitions.find((edge) => edge.from === topic.id)?.to ?? null;
        if (successor != null) {
          merged.set(topic.id, successor);
          continue;
        }
      }
      kept.push(topic);
    }
    // A stub may point at another stub; follow the chain to a surviving topic.
    const resolve = (id) => {
      const seen = new Set();
      let target = id;
      while (merged.has(target) && !seen.has(target)) {
        seen.add(target);
        target = merged.get(target);
      }
      return target;
    };
    for (const [stubId, _] of merged) {
      const stub = this.topics.find((topic) => topic.id === stubId);
      const host = kept.find((topic) => topic.id === resolve(stubId));
      if (stub && host) host.utteranceIds = [...stub.utteranceIds, ...host.utteranceIds];
    }

    const edges = [];
    for (const edge of this.transitions) {
      const from = resolve(edge.from);
      const to = resolve(edge.to);
      if (from === to) continue;
      const existing = edges.find((item) => item.from === from && item.to === to);
      if (existing) {
        existing.weight += edge.weight;
        if (edge.kind === "return") existing.kind = "return";
      } else {
        edges.push({ ...edge, from, to });
      }
    }
    return { topics: kept, edges };
  }

  // The stack's contents: what was started and never finished, most recently
  // dropped first. The live topic is never listed — you are already in it.
  openThreads(at = this.now()) {
    this._flushPending();
    return this._condensed()
      .topics.filter((topic) => topic.id !== this.currentId && !topic.resolved)
      .map((topic) => ({
        id: topic.id,
        label: topic.label,
        state: at - topic.lastAt >= this.dropAfterMs ? "dropped" : "open",
        lastAt: topic.lastAt,
        durationMs: topic.durationMs,
      }))
      .sort((a, b) => b.lastAt - a.lastAt);
  }

  // The graph's contents. Node weight is time spent, which is what the radius
  // encodes; edges keep their direction and weight.
  //
  // `final` is the snapshot a finished conversation is stored as. Nothing is
  // being spoken in a record, so nothing in it is live: stored with the topic
  // that happened to be current at stop marked `live`, the reading view drew it
  // gold — a second accent beside the selected node (DESIGN.md §9.4) — on a
  // subject nobody was discussing any more, and hid whether it had been
  // resolved, because `live` is decided before `resolved` is consulted.
  snapshot(at = this.now(), { final = false } = {}) {
    this._flushPending();
    const { topics, edges } = this._condensed();
    const nodes = topics.map((topic) => ({
      id: topic.id,
      label: topic.label,
      words: topic.words.slice(0, 8),
      durationMs: topic.durationMs,
      utteranceIds: [...topic.utteranceIds],
      firstAt: topic.firstAt,
      lastAt: topic.lastAt,
      returns: topic.returns,
      state:
        !final && topic.id === this.currentId
          ? "live"
          : topic.resolved
            ? "resolved"
            : at - topic.lastAt >= this.dropAfterMs
              ? "dropped"
              : "open",
    }));
    return { nodes, edges };
  }
}

export { ConversationTopicTracker, contentWords, coverage, similarity, topicLabel };
