// A fake microphone, so the harness never asks the browser for a real one.
//
// The recording store opens the microphone with `getUserMedia`, builds its own
// AudioContext, and reads the level from an AnalyserNode
// (`MeetingRecordingMount` samples it ten times a second). This keeps all of
// that real and replaces only the two ends:
//
//   - `getUserMedia` returns a silent stream from a private AudioContext, so no
//     permission prompt ever appears and no audio is captured;
//   - an AnalyserNode reports the level of the room being replayed, so the
//     listening ring, the live contour and the loudness kept at Finish all come
//     from the app's own measurement of it.
//
// Analysers report the level whether or not the AudioContext is running, so a
// replay started from a script (no click, so autoplay keeps contexts
// suspended) still has a moving microphone.

const RealAudioContext = window.AudioContext;
let levelProvider = () => 0.006;

/** Where the fake microphone's level comes from: a function of nothing, read on demand. */
export function setLevelProvider(provider) {
  levelProvider = typeof provider === "function" ? provider : () => 0.006;
}

function fillWithLevel(buffer) {
  const level = Math.max(0, Math.min(1, Number(levelProvider()) || 0));
  // A sine of this amplitude has exactly this RMS.
  const amplitude = level * Math.SQRT2;
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] = amplitude * Math.sin((index * 2 * Math.PI) / 16);
  }
}

class DemoAudioContext extends RealAudioContext {
  createAnalyser() {
    const analyser = super.createAnalyser();
    analyser.getFloatTimeDomainData = fillWithLevel;
    return analyser;
  }

  // A context made without a user gesture stays suspended, and the store waits
  // on `resume()`. The level does not need it running, so it never waits long.
  resume() {
    const resumed = super.resume().catch(() => {});
    return Promise.race([resumed, new Promise((resolve) => setTimeout(resolve, 60))]);
  }

  setSinkId() {
    return Promise.resolve();
  }
}

let silentContext = null;

function silentStream() {
  silentContext ??= new RealAudioContext();
  return silentContext.createMediaStreamDestination().stream;
}

const FAKE_DEVICE = {
  deviceId: "oats-demo-microphone",
  groupId: "oats-demo",
  kind: "audioinput",
  label: "MacBook Pro Microphone",
  toJSON() {
    return { ...this };
  },
};

export function installFakeMicrophone() {
  window.AudioContext = DemoAudioContext;
  if (window.webkitAudioContext) window.webkitAudioContext = DemoAudioContext;
  const devices = navigator.mediaDevices;
  if (devices) {
    Object.defineProperty(devices, "getUserMedia", {
      configurable: true,
      value: async (constraints) => {
        if (!constraints?.audio) throw new DOMException("Demo has no camera", "NotFoundError");
        return silentStream();
      },
    });
    Object.defineProperty(devices, "enumerateDevices", {
      configurable: true,
      value: async () => [FAKE_DEVICE],
    });
    Object.defineProperty(devices, "getDisplayMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException("Demo has no screen capture", "NotAllowedError");
      },
    });
  }
  const permissions = navigator.permissions;
  if (permissions?.query) {
    const query = permissions.query.bind(permissions);
    Object.defineProperty(permissions, "query", {
      configurable: true,
      value: (descriptor) =>
        descriptor?.name === "microphone"
          ? Promise.resolve({ state: "granted", onchange: null })
          : query(descriptor),
    });
  }
}
