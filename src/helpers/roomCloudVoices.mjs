// A room whose words are read in the cloud: the lines its speaker pass needs.
//
// On the cloud route the microphone goes to a realtime session and no line
// is cut on the Mac, so nobody in the room was told apart. Here the same
// audio is cut where people pause (speechSegmenter.mjs), each line gets its
// voice (roomVoiceTracker.mjs), and the recording keeps its own clock: the
// cloud's turns are placed on it by their offsets in the session
// (openaiRealtimeStreaming.js), so the reader can give each turn the person
// whose lines it overlaps most (speakerTurns.mjs). No audio is kept.
//
// Pure: the embedding comes from outside. Pinned by
// test/helpers/roomCloudVoices.test.js.

import { SpeechSegmenter, SAMPLE_RATE } from "./speechSegmenter.mjs";
import { RoomVoiceTracker } from "./roomVoiceTracker.mjs";

export class RoomCloudVoices {
  /**
   * @param {{ extract: ((samples: Int16Array) => Promise<Float32Array | null>) | null,
   *   startedAt?: number }} options
   */
  constructor({ extract, startedAt = Date.now() }) {
    this.segmenter = new SpeechSegmenter();
    this.voices = new RoomVoiceTracker({ extract });
    this.startedAt = startedAt;
    this.samples = 0;
  }

  /** The recording so far, in ms: where the cloud's offsets are counted back from. */
  get recordedMs() {
    return (this.samples / SAMPLE_RATE) * 1000;
  }

  /**
   * The microphone's next 16 kHz samples, every chunk of them, in order.
   * @param {Int16Array} samples
   */
  push(samples) {
    this.samples += samples.length;
    if (!this.voices.enabled) return;
    for (const segment of this.segmenter.push(samples)) this.voices.add(segment);
  }

  /** Stop: the last line closes. What the speaker pass takes. */
  finish() {
    if (this.voices.enabled) {
      for (const segment of this.segmenter.flush()) this.voices.add(segment);
    }
    return { startedAt: this.startedAt, voices: this.voices };
  }

  /** The recording was abandoned: forget every voice. */
  drop() {
    this.voices.drop();
  }
}
