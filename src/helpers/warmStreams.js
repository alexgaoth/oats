// Warm streams hold the key they were opened with (ipcHandlers.js): a
// dictation stream a warm-up opened, and the meeting streams a prepare opened.
// When a feature's key changes (replaced, removed, another chosen), a warm
// stream that nothing uses yet is closed, so the next start opens one on the
// key now chosen. A stream in use keeps going. test/helpers/warmStreams.test.js
// pins it.

/**
 * The names of the warm streams to close.
 *
 * @param {Array<{ name: string, warm: boolean, feature: string, key: string | undefined }>} streams
 * @param {(feature: string) => string} keyNow The key the feature uses now ("" for none).
 * @returns {string[]}
 */
function staleWarmStreams(streams, keyNow) {
  return streams
    .filter(
      (stream) => stream.warm && stream.key !== undefined && keyNow(stream.feature) !== stream.key
    )
    .map((stream) => stream.name);
}

module.exports = { staleWarmStreams };
