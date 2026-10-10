const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// The switch's knob must sit the same distance from the track edge when on
// and when off. Tailwind units are 4px: w-9 = 36, h-5 = 20, p-0.5 = 2,
// size-4 = 16, translate-x-4 = 16.
const SOURCE = fs.readFileSync(path.join(__dirname, "../../src/components/ui/toggle.tsx"), "utf8");

const unit = (name) => {
  const match = SOURCE.match(new RegExp(`\\b${name}-(\\d+(?:\\.5)?)\\b`));
  assert.ok(match, `${name}-* not found`);
  return Number(match[1]) * 4;
};

test("the switch knob is centred the same way on and off", () => {
  const trackWidth = unit("w");
  const trackHeight = unit("h");
  const padding = unit("p");
  const knob = unit("size");
  const travel = unit("translate-x");
  assert.doesNotMatch(SOURCE, /translate-x-\[calc/, "the travel must be a fixed step");
  assert.doesNotMatch(SOURCE, /\bborder border-transparent\b/, "no border inside the track");
  const offGap = padding;
  const onGap = trackWidth - padding - travel - knob;
  const verticalGap = (trackHeight - knob) / 2;
  assert.equal(onGap, offGap, "gap at the right end when on equals the gap at the left when off");
  assert.equal(verticalGap, offGap, "the vertical gap matches the horizontal one");
});
