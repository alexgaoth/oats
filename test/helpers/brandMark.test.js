const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const MARK = fs.readFileSync(
  path.join(__dirname, "../../src/components/shell/OatsMark.tsx"),
  "utf8"
);

// The old mark filled its tile with the foreground colour, so it turned black
// on the light app and white on the dark one. The symbol is the same in both.
test("the brand mark uses no theme colours", () => {
  assert.doesNotMatch(MARK, /(fill|stroke)-(foreground|background|brand|primary)/);
  assert.doesNotMatch(MARK, /var\(--color-/);
});

test("the brand mark does not spin under reduced motion", () => {
  assert.match(MARK, /prefers-reduced-motion: reduce/);
  const spin = MARK.slice(MARK.indexOf("const spin = useCallback"));
  assert.ok(
    spin.indexOf("prefers-reduced-motion") < spin.indexOf("requestAnimationFrame"),
    "the reduced-motion check comes before any frame is requested"
  );
});

test("every icon file is built from the SVG masters", () => {
  const script = fs.readFileSync(
    path.join(__dirname, "../../scripts/build-brand-icons.sh"),
    "utf8"
  );
  for (const output of ["icon.png", "icon.icns", "icon.ico", "ICON.png", "iconTemplate@3x.png"]) {
    assert.ok(script.includes(output), `${output} is produced by the script`);
  }
});
