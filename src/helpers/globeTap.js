// When a press of Fn (the 🌐 key) is a tap that should toggle dictation.
//
// Fn is also a modifier. Fn+Delete is forward delete, Fn+arrows are Home and
// End, Fn+F-keys are the function row, and a held 🌐 opens the input-source and
// emoji pickers. In tap mode dictation used to toggle the moment Fn went down —
// so every one of those chords started a recording, and the next one pasted
// whatever it heard into the frontmost app.
//
// A tap is now a press that is released quickly with no other key in between:
// the listener reports `FN_INTERRUPTED` when another key goes down during the
// hold, and the toggle happens on release. Push mode is unchanged.

const MAX_TAP_MS = 500;

/**
 * @param {{ now?: () => number, maxTapMs?: number }} [options]
 */
function createGlobeTap({ now = Date.now, maxTapMs = MAX_TAP_MS } = {}) {
  let downAt = null;
  let interrupted = false;
  return {
    down() {
      downAt = now();
      interrupted = false;
    },
    interrupted() {
      interrupted = true;
    },
    /** Whether this release completes a tap. Forgets the press either way. */
    up() {
      const wasTap = downAt !== null && !interrupted && now() - downAt <= maxTapMs;
      downAt = null;
      interrupted = false;
      return wasTap;
    },
  };
}

module.exports = { createGlobeTap, MAX_TAP_MS };
