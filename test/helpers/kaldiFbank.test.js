const test = require("node:test");
const assert = require("node:assert/strict");

let computeFbank, NUM_BINS;

test.before(async () => {
  ({ computeFbank, NUM_BINS } = await import("../../src/helpers/kaldiFbank.mjs"));
});

/** Half a second of tones and noise, the same in JavaScript and Python (float32 samples). */
function synth(n = 8000, rate = 16000) {
  let state = 12345n;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    state = (state * 1103515245n + 12345n) % 2147483648n;
    const noise = (Number(state) / 2147483648) * 2 - 1;
    out[i] =
      0.3 * Math.sin(2 * Math.PI * 220 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t)) +
      0.1 * Math.sin(2 * Math.PI * 1375 * t + 0.7) +
      0.05 * Math.sin(2 * Math.PI * 3100 * t) +
      0.02 * noise;
  }
  return out;
}

// kaldi-native-fbank's frames for synth(), as sherpa-onnx configures it for a
// 3D-Speaker voice model, rounded to 4 places. Regenerate with:
//   o = knf.FbankOptions(); o.frame_opts.dither = 0; o.frame_opts.snip_edges = False
//   o.mel_opts.num_bins = 80; o.mel_opts.low_freq = 20; o.mel_opts.high_freq = -400
//   f = knf.OnlineFbank(o); f.accept_waveform(16000, samples); f.input_finished()
const REFERENCE = {
  numFrames: 50,
  frames: {
    0: [
      -5.6465, -4.517, -3.8969, -3.4136, -2.4735, -1.4602, -0.0747, 0.1762, 0.1127, -0.7325,
      -1.9467, -2.9141, -3.5949, -4.3094, -4.3693, -4.6857, -4.4368, -4.9584, -6.3816, -6.268,
      -5.4306, -5.5437, -4.6826, -4.7078, -4.1203, -3.7625, -3.8744, -2.5173, -2.7899, -2.1567,
      -1.7256, -0.8865, 0.1673, 2.4787, 3.3947, 2.2953, 0.4272, -0.6772, -1.0878, -1.3578, -2.0018,
      -2.2689, -3.9598, -2.8135, -2.5483, -4.0782, -4.001, -4.401, -3.1431, -3.8322, -2.57, -1.9619,
      -0.885, 1.4572, 3.8189, 2.7558, -0.1983, -0.7832, -1.1381, -1.2542, 0.115, -0.7444, -2.1396,
      -2.0306, -1.1412, -2.4422, -1.5713, -1.6702, -1.4589, -1.0949, -1.2349, -0.3212, -1.0411,
      -1.523, -0.5972, -1.2765, -0.6341, 0.4013, 0.2789, -0.613,
    ],
    1: [
      -6.8349, -12.2133, -8.0074, -6.4438, -4.738, -2.1898, 0.1893, 1.1521, 0.4034, -1.1404,
      -4.1063, -6.3344, -6.7141, -6.2001, -6.126, -7.4537, -8.5055, -6.9705, -6.4865, -6.9221,
      -6.846, -7.8713, -6.0924, -5.8301, -7.1077, -5.6235, -6.3247, -5.7735, -4.8888, -4.9495,
      -4.7959, -4.5669, -3.7072, 1.7128, 3.7102, 2.2396, -3.3434, -5.0764, -5.2733, -3.9906,
      -4.3265, -4.0421, -4.184, -4.0327, -3.1236, -3.2062, -3.3231, -3.6292, -1.8727, -2.8583,
      -2.7267, -2.868, -2.7033, 0.8562, 4.0123, 2.2838, -2.9666, -2.5721, -2.2896, -2.4212, -0.8475,
      -1.0263, -1.419, -1.6779, -2.1495, -1.9062, -1.9064, -1.3691, -0.7428, -0.5178, -1.0295,
      -0.319, -1.2933, -1.2485, -1.6957, -1.6158, 0.0616, -0.3962, -0.6958, 0.2702,
    ],
    25: [
      -11.6539, -10.8621, -11.4394, -11.0464, -10.8225, -10.6387, -9.6843, -8.8267, -8.0793,
      -9.0407, -9.6051, -9.8987, -8.6661, -7.4687, -7.491, -8.175, -8.6983, -9.0928, -6.8088,
      -5.6046, -5.6905, -6.7601, -4.8749, -4.2043, -4.9233, -6.0947, -7.7077, -5.6126, -4.3798,
      -4.6391, -4.6769, -5.2936, -3.5662, 1.7256, 3.7264, 2.261, -2.6723, -4.1754, -3.5435, -2.8534,
      -3.0588, -3.3476, -4.2756, -5.7108, -3.0537, -3.0352, -3.833, -2.8788, -2.7126, -2.6846,
      -3.0945, -3.8379, -2.4833, 0.6956, 3.9902, 2.2958, -2.2824, -1.8819, -2.5996, -1.4701, -2.465,
      -1.5429, -1.0537, -1.5297, -1.3865, -1.8075, -0.3938, -1.2894, -1.2558, -1.9776, -2.5196,
      -0.8183, -0.3395, -1.5188, -1.4165, -1.1041, -0.6911, -0.2646, 0.2082, -0.923,
    ],
    48: [
      -7.2041, -8.8779, -7.5613, -6.8199, -4.7416, -2.1958, 0.1643, 1.1172, 0.3397, -1.2435, -4.31,
      -6.3114, -8.687, -8.4511, -9.1419, -8.2182, -7.9118, -7.1176, -7.5799, -6.5282, -6.1719,
      -6.687, -6.2441, -6.5967, -6.9116, -6.6105, -6.931, -6.2688, -4.5747, -5.0293, -5.6957,
      -6.0522, -3.5153, 1.7279, 3.7082, 2.2473, -3.2, -3.4908, -3.6726, -4.7933, -4.6392, -3.4451,
      -3.196, -4.2117, -3.1323, -3.3903, -3.6525, -3.6723, -2.4328, -2.7748, -2.7338, -3.1969,
      -2.3601, 0.8942, 4.0122, 2.2362, -3.0216, -1.8327, -1.4127, -2.0707, -1.3885, -1.5148,
      -1.6284, -2.7657, -2.0029, -0.5883, -0.8295, -1.8622, -2.3851, -1.4398, -1.2791, 0.1065,
      -0.237, -0.8419, -0.2124, -0.0831, -1.2175, -0.6582, -0.7819, -0.4899,
    ],
    49: [
      -5.5457, -4.5441, -3.7513, -3.2404, -2.3121, -1.3533, -0.0819, 0.043, 0.0807, -0.6252,
      -1.6227, -2.3872, -2.959, -3.4444, -3.5727, -3.276, -3.1384, -3.5178, -3.6862, -3.6094,
      -3.4224, -3.556, -3.8596, -3.4559, -3.3294, -3.403, -3.072, -2.514, -2.18, -1.8964, -1.6663,
      -1.0816, 0.0099, 1.9775, 3.3815, 2.7713, 0.4681, -0.3499, -1.3234, -1.3336, -1.547, -2.1326,
      -2.1253, -2.0539, -1.8433, -2.601, -2.001, -1.5721, -1.5936, -2.6462, -2.328, -1.3984,
      -0.2837, 1.7637, 3.8568, 2.2531, -0.3395, -0.9657, -1.0322, -2.9906, -2.4289, -1.7652,
      -2.5727, -2.8012, -3.0838, -1.9025, -1.7707, -0.3633, -0.5917, -1.4672, -0.9287, -0.7163,
      -1.0384, -0.1385, -0.7899, -0.2775, -0.0207, -1.0968, -1.4642, 0.1879,
    ],
  },
};

test("the frames match kaldi-native-fbank's, as sherpa-onnx computes them", () => {
  const { features, numFrames } = computeFbank(synth(), { globalMean: false });
  assert.equal(numFrames, REFERENCE.numFrames);
  let worst = 0;
  for (const [frame, row] of Object.entries(REFERENCE.frames)) {
    row.forEach((expected, bin) => {
      worst = Math.max(worst, Math.abs(features[Number(frame) * NUM_BINS + bin] - expected));
    });
  }
  // Float32 in kaldi-native-fbank, float64 here, and the 4-place rounding.
  assert.ok(worst < 1e-3, `largest difference ${worst}`);
});

test("frames are centred on each 10 ms step, so a recording of n samples has (n + 80) / 160", () => {
  assert.equal(computeFbank(new Float32Array(0)).numFrames, 0);
  assert.equal(computeFbank(new Float32Array(79)).numFrames, 0);
  assert.equal(computeFbank(new Float32Array(80)).numFrames, 1);
  assert.equal(computeFbank(new Float32Array(16000)).numFrames, 100);
});

test("by default each band's mean over the input is taken out, as the voice models want", () => {
  const { features, numFrames } = computeFbank(synth());
  for (let bin = 0; bin < NUM_BINS; bin++) {
    let sum = 0;
    for (let f = 0; f < numFrames; f++) sum += features[f * NUM_BINS + bin];
    assert.ok(Math.abs(sum / numFrames) < 1e-4, `band ${bin} mean ${sum / numFrames}`);
  }
});

test("silence gives the floor, not -Infinity or NaN", () => {
  const { features } = computeFbank(new Float32Array(1600), { globalMean: false });
  assert.ok(features.every((v) => Number.isFinite(v)));
  assert.ok(Math.abs(features[0] - Math.log(1.1920928955078125e-7)) < 1e-6);
});
