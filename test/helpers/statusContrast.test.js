const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// DESIGN.md §9: text ≥ 4.5:1 in both themes. Measured in the 2026-11-08 screen
// audit: white on the #ef4444 Stop fill was 3.76:1, status words on their own
// tint fell to 2.95:1 (success) and 3.3:1 (recording), and the inactive labels
// of a segmented track (muted text on the muted fill) were 4.40:1. Source-level:
// the values are computed here from the tokens the components use.

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const CSS = read("src/index.css");
const BUTTON = read("src/components/ui/button.tsx");
const BADGE = read("src/components/ui/badge.tsx");
const SIDEBAR = read("src/components/shell/AppSidebar.tsx");
const TRACKS = ["tabs.tsx", "segmented.tsx", "view-switch.tsx"].map((file) =>
  read(`src/components/ui/${file}`)
);

const block = (start) => {
  const from = CSS.indexOf(start);
  assert.ok(from >= 0, start);
  return CSS.slice(from, CSS.indexOf("\n}", from));
};
const tokens = (text) =>
  Object.fromEntries(
    [...text.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]])
  );
const LIGHT = tokens(block("@theme"));
const DARK = { ...LIGHT, ...tokens(block("\n.dark {")) };

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v * t + b[i] * (1 - t));
const luminance = (c) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("a red fill under a white label reads at 4.5:1 in both themes", () => {
  for (const theme of [LIGHT, DARK]) {
    for (const fill of ["destructive-fill", "recording-fill"]) {
      assert.ok(theme[fill], fill);
      const ratio = contrast(rgb(theme[fill]), rgb("#ffffff"));
      assert.ok(ratio >= 4.5, `${fill} ${ratio.toFixed(2)}:1`);
    }
  }
  assert.match(BUTTON, /destructive:\s*"bg-destructive-fill text-destructive-foreground/);
  assert.match(BUTTON, /record:\s*"bg-recording-fill text-recording-foreground/);
  assert.match(SIDEBAR, /"bg-recording-fill text-recording-foreground/);
  assert.doesNotMatch(
    SIDEBAR,
    /tabular-nums opacity-90/,
    "the live clock is not dimmed on the fill"
  );
});

test("a status badge's words read at 4.5:1 on its own tint", () => {
  const tints = [
    [LIGHT, LIGHT.card, 0.1],
    [DARK, DARK.card, 0.2],
    [DARK, DARK.background, 0.2],
  ];
  for (const tone of ["success", "warning", "destructive", "recording", "info"]) {
    assert.match(
      BADGE,
      new RegExp(`${tone}:\\s*"border-transparent bg-${tone}/10 text-${tone}-ink`)
    );
    for (const [theme, under, alpha] of tints) {
      const tint = mix(rgb(theme[tone]), rgb(under), alpha);
      const ratio = contrast(rgb(theme[`${tone}-ink`]), tint);
      assert.ok(ratio >= 4.5, `${tone} on ${under} ${ratio.toFixed(2)}:1`);
    }
  }
});

test("the unchosen labels on a segmented track read at 4.5:1", () => {
  for (const source of TRACKS) {
    assert.doesNotMatch(source, /text-muted-foreground/);
    assert.match(source, /text-foreground\/65/);
  }
  for (const theme of [LIGHT, DARK]) {
    const label = mix(rgb(theme.foreground), rgb(theme.muted), 0.65);
    const ratio = contrast(label, rgb(theme.muted));
    assert.ok(ratio >= 4.5, `${ratio.toFixed(2)}:1`);
  }
});
