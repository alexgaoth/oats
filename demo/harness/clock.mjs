// The page's clock, so a replay can be paused, sped up and moved forward.
//
// The app reads wall time through `Date.now()` everywhere that matters to a
// recording: the clock under the record button, the live contour's window,
// when a segment or a question card happened, the flow card's hold between
// views. Replacing that one function moves all of them together. Timers
// (`setTimeout`) still run on real time; see demo/README.md.

const realNow = Date.now.bind(Date);

let anchorReal = realNow();
let anchorVirtual = anchorReal;
let rate = 1;
let paused = false;

function now() {
  return paused ? anchorVirtual : anchorVirtual + (realNow() - anchorReal) * rate;
}

function rebase() {
  anchorVirtual = now();
  anchorReal = realNow();
}

export function installClock() {
  Date.now = now;
}

/** Virtual milliseconds per real millisecond. */
export function setRate(next) {
  rebase();
  rate = Math.max(0.05, Number(next) || 1);
}

export function getRate() {
  return rate;
}

export function pauseClock() {
  if (paused) return;
  rebase();
  paused = true;
}

export function resumeClock() {
  if (!paused) return;
  anchorReal = realNow();
  paused = false;
}

export function isPaused() {
  return paused;
}

/** Jump to a virtual time, forward only. */
export function setVirtualTime(time) {
  const current = now();
  if (!(time > current)) return;
  anchorVirtual = time;
  anchorReal = realNow();
}
