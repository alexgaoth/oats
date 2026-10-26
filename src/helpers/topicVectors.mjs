// Meaning for the on-device topic names.
//
// The topic tracker names a topic with a phrase the room said
// (`conversationTopics.mjs`). Given sentence vectors, it prefers the phrase
// closest in meaning to what the topic says: on the AMI meetings that named
// the subject more often than a vivid detail of it (scripts/topic-eval.mjs
// --vectors). This feeds it the vectors: each turn as it lands, and the
// phrases that could name a topic, embedded in batches by the app's own
// all-MiniLM-L6-v2 in the main process (`embed-texts`). Nothing leaves the
// computer.
//
// The tracker's lexical names are the instant answer and stay the answer
// whenever there are no vectors: no model on disk, a failed request, or a turn
// not embedded yet. One request is in flight at a time, so a busy worker
// delays names and never queues work without bound. The first failure turns
// the feeder off for the rest of the recording.
//
// Pure and DOM-free (the request is passed in), so it unit-tests under
// node:test.

/** Texts per request: about 0.2 s of the ONNX worker. */
export const VECTOR_BATCH = 48;

export class TopicVectorFeeder {
  /**
   * @param {{ tracker: { addVectors: Function, phrasesToEmbed: Function },
   *   embed: (texts: string[]) => Promise<{ success: boolean, vectors?: number[][] } | null | undefined>,
   *   onChange?: () => void, batch?: number }} options
   */
  constructor({ tracker, embed, onChange = () => {}, batch = VECTOR_BATCH }) {
    this.tracker = tracker;
    this.embed = embed;
    this.onChange = onChange;
    this.batch = batch;
    this.queue = [];
    this.busy = false;
    this.off = typeof embed !== "function";
    this.stopped = false;
    this.requests = 0;
  }

  /** A finalized turn: its words are embedded with the next request. */
  observe(utterance) {
    if (this.off || this.stopped) return;
    const text = String(utterance?.text ?? "").trim();
    if (!text || utterance?.id == null) return;
    this.queue.push({ id: String(utterance.id), text });
    void this.pump();
  }

  /** Requests vectors until nothing is waiting. Resolves when idle. */
  async pump() {
    if (this.busy || this.off || this.stopped) return;
    this.busy = true;
    try {
      for (;;) {
        const turns = this.queue.splice(0, this.batch);
        const phrases = this.tracker.phrasesToEmbed(this.batch - turns.length);
        if (!turns.length && !phrases.length) return;
        const texts = [...turns.map((turn) => turn.text), ...phrases.map((phrase) => phrase.text)];
        this.requests += 1;
        let result = null;
        try {
          result = await this.embed(texts);
        } catch {
          result = null;
        }
        if (this.stopped) return;
        const vectors = result?.success ? result.vectors : null;
        if (!Array.isArray(vectors) || vectors.length !== texts.length) {
          this.off = true;
          return;
        }
        this.tracker.addVectors({
          utterances: turns.map((turn, index) => [turn.id, vectors[index]]),
          phrases: phrases.map((phrase, index) => [phrase.key, vectors[turns.length + index]]),
        });
        this.onChange();
      }
    } finally {
      this.busy = false;
    }
  }

  /** The recording ended or another began: no more requests, no more changes. */
  stop() {
    this.stopped = true;
    this.queue = [];
  }
}
