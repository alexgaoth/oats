/**
 * One recording's Parakeet route. Only finals count as failures. A failed
 * read goes to Whisper before the queue can advance to the next segment.
 */
export class RoomTranscriptionFallback {
  constructor({ prepare, read, backup, onFallback }) {
    this.prepare = prepare;
    this.read = read;
    this.backup = backup;
    this.onFallback = onFallback;
    this.starting = null;
    this.failures = 0;
    this.usingBackup = false;
    this.notified = false;
  }

  start() {
    this.starting ??= Promise.resolve()
      .then(() => this.prepare())
      .catch((error) => {
        this.usingBackup = true;
        this.notify(error);
      });
    return this.starting;
  }

  notify(error) {
    if (this.notified) return;
    this.notified = true;
    this.onFallback(error);
  }

  async final(...args) {
    await this.start();
    if (!this.usingBackup) {
      try {
        const result = await this.read(...args);
        if (!result?.success) throw new Error("Parakeet read failed");
        this.failures = 0;
        return result;
      } catch (error) {
        this.failures++;
        if (this.failures >= 2) this.usingBackup = true;
        this.notify(error);
      }
    }
    return this.backup(...args);
  }
}
