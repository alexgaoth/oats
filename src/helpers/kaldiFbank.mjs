// The filterbank features a 3D-Speaker voice model was trained on, computed
// the way sherpa-onnx computes them for it (kaldi-native-fbank).
//
// A voice model reads 80 log mel energies a frame, 25 ms frames every 10 ms.
// The details decide whether it hears the voice it learned: on one recording
// (SBC005, docs/room-speakers.md), features whose top mel band ended at 8 kHz
// instead of 7.6 kHz gave voice embeddings only 0.84 to 0.93 as similar to the
// model's own, and frames cut flush at the edges (`snip_edges`) 0.97 to 0.99.
// With every option below, the same as sherpa-onnx: 1.00000.
//
// The options, Kaldi's names: 16 kHz; frames of 400 samples every 160; no
// dither; the frame's mean removed; pre-emphasis 0.97; Povey window; a 512
// point FFT; power spectrum; 80 mel bands from 20 Hz to 7,600 Hz (Nyquist
// minus 400), Kaldi's triangles; log, floored at FLT_EPSILON; frames centred
// on their 10 ms step, the audio reflected at both ends (snip_edges false).
// The model then wants the mean of each band over the whole input taken out
// (`feature_normalize_type: global-mean`), and samples in [-1, 1]
// (`normalize_samples: 1`).
//
// Pure and DOM-free; pinned by test/helpers/kaldiFbank.test.js against
// kaldi-native-fbank's own output.

export const SAMPLE_RATE = 16000;
export const NUM_BINS = 80;
const FRAME_LENGTH = 400;
const FRAME_SHIFT = 160;
const FFT_SIZE = 512;
const PREEMPH = 0.97;
const LOW_FREQ = 20;
const HIGH_FREQ = SAMPLE_RATE / 2 - 400;
const LOG_FLOOR = 1.1920928955078125e-7; // FLT_EPSILON

const melScale = (freq) => 1127 * Math.log(1 + freq / 700);

let tables = null;

function buildTables() {
  if (tables) return tables;
  const window = new Float64Array(FRAME_LENGTH);
  for (let i = 0; i < FRAME_LENGTH; i++) {
    window[i] = Math.pow(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME_LENGTH - 1)), 0.85);
  }
  // Kaldi's mel triangles over the first FFT_SIZE / 2 bins (MelBanks).
  const fftBins = FFT_SIZE / 2;
  const binWidth = SAMPLE_RATE / FFT_SIZE;
  const melLow = melScale(LOW_FREQ);
  const melDelta = (melScale(HIGH_FREQ) - melLow) / (NUM_BINS + 1);
  const banks = [];
  for (let bin = 0; bin < NUM_BINS; bin++) {
    const left = melLow + bin * melDelta;
    const center = left + melDelta;
    const right = center + melDelta;
    let first = -1;
    const weights = [];
    for (let i = 0; i < fftBins; i++) {
      const mel = melScale(binWidth * i);
      if (mel > left && mel < right) {
        if (first < 0) first = i;
        weights.push(
          mel <= center ? (mel - left) / (center - left) : (right - mel) / (right - center)
        );
      } else if (first >= 0) {
        break;
      }
    }
    banks.push({ first, weights: Float64Array.from(weights) });
  }
  // Bit reversal and twiddles for the 512-point FFT.
  const bits = Math.log2(FFT_SIZE);
  const reverse = new Uint16Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    reverse[i] = r;
  }
  const cos = new Float64Array(FFT_SIZE / 2);
  const sin = new Float64Array(FFT_SIZE / 2);
  for (let i = 0; i < FFT_SIZE / 2; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / FFT_SIZE);
    sin[i] = Math.sin((-2 * Math.PI * i) / FFT_SIZE);
  }
  tables = { window, banks, reverse, cos, sin };
  return tables;
}

/** In place: the power spectrum of `re` (length FFT_SIZE, `im` zeroed), bins 0..FFT_SIZE/2. */
function powerSpectrum(re, im, t) {
  for (let i = 0; i < FFT_SIZE; i++) {
    const j = t.reverse[i];
    if (j > i) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
    }
  }
  for (let size = 2; size <= FFT_SIZE; size <<= 1) {
    const half = size >> 1;
    const step = FFT_SIZE / size;
    for (let start = 0; start < FFT_SIZE; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = t.cos[k * step];
        const wi = t.sin[k * step];
        const a = start + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
  for (let i = 0; i <= FFT_SIZE / 2; i++) re[i] = re[i] * re[i] + im[i] * im[i];
}

/**
 * Log mel filterbank frames of 16 kHz mono samples in [-1, 1].
 * @param {Float32Array | Float64Array | number[]} samples
 * @param {{ globalMean?: boolean }} [options] take each band's mean out (the voice models' input)
 * @returns {{ features: Float32Array, numFrames: number }} frame-major, NUM_BINS a frame
 */
export function computeFbank(samples, { globalMean = true } = {}) {
  const n = samples.length;
  const numFrames = n > 0 ? Math.floor((n + FRAME_SHIFT / 2) / FRAME_SHIFT) : 0;
  const features = new Float32Array(numFrames * NUM_BINS);
  if (!numFrames) return { features, numFrames };
  const t = buildTables();
  const frame = new Float64Array(FRAME_LENGTH);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  for (let f = 0; f < numFrames; f++) {
    const start = f * FRAME_SHIFT + FRAME_SHIFT / 2 - FRAME_LENGTH / 2;
    let sum = 0;
    for (let i = 0; i < FRAME_LENGTH; i++) {
      let s = start + i;
      while (s < 0 || s >= n) s = s < 0 ? -s - 1 : 2 * n - 1 - s;
      frame[i] = samples[s];
      sum += frame[i];
    }
    const mean = sum / FRAME_LENGTH;
    for (let i = 0; i < FRAME_LENGTH; i++) frame[i] -= mean;
    for (let i = FRAME_LENGTH - 1; i > 0; i--) frame[i] -= PREEMPH * frame[i - 1];
    frame[0] -= PREEMPH * frame[0];
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < FRAME_LENGTH; i++) re[i] = frame[i] * t.window[i];
    powerSpectrum(re, im, t);
    const row = f * NUM_BINS;
    for (let m = 0; m < NUM_BINS; m++) {
      const { first, weights } = t.banks[m];
      let energy = 0;
      for (let k = 0; k < weights.length; k++) energy += weights[k] * re[first + k];
      features[row + m] = Math.log(Math.max(energy, LOG_FLOOR));
    }
  }
  if (globalMean) {
    for (let m = 0; m < NUM_BINS; m++) {
      let sum = 0;
      for (let f = 0; f < numFrames; f++) sum += features[f * NUM_BINS + m];
      const mean = sum / numFrames;
      for (let f = 0; f < numFrames; f++) features[f * NUM_BINS + m] -= mean;
    }
  }
  return { features, numFrames };
}
