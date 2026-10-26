const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The chart style (DESIGN.md §6): the one module every chart draws through.
// Its functions are exercised against a recording 2D context, so what is pinned
// is what they paint, not how the source reads. The contour and its legend are
// source-level, like the other components: they need a DOM to render.

let S;
let ditherStep;
let BAYER_4X4;

test.before(async () => {
  // The dither tile is a 4x4 canvas; node has none, so a tiny one stands in.
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.lit = [];
    }
    getContext() {
      const tile = this;
      return {
        set fillStyle(value) {
          tile.color = value;
        },
        fillRect(x, y) {
          tile.lit.push(y * 4 + x);
        },
      };
    }
  };
  globalThis.Path2D = class {
    constructor() {
      this.rects = [];
    }
    rect(...values) {
      this.rects.push(values);
    }
  };
  S = await import("../../src/components/charts/chartStyle.ts");
  ({ ditherStep, BAYER_4X4 } = await import("../../src/helpers/chartDither.mjs"));
});

const PALETTE = {
  ink: "ink",
  quiet: "quiet",
  rule: "rule",
  card: "card",
  background: "background",
  honey: "honey",
  success: "success",
  warning: "warning",
  sans: "Sans",
};

/** A 2D context that records what is drawn, with the transform it was drawn under. */
function recorder({ width = 400, height = 200 } = {}) {
  const calls = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const fields = ["fillStyle", "strokeStyle", "lineWidth", "globalAlpha", "font", "textAlign"];
  const ctx = {
    calls,
    canvas: { width, height },
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    save() {
      stack.push({ matrix, ...Object.fromEntries(fields.map((key) => [key, ctx[key]])) });
    },
    restore() {
      const saved = stack.pop();
      matrix = saved.matrix;
      for (const key of fields) ctx[key] = saved[key];
    },
    setTransform(...values) {
      matrix = values;
      calls.push(["setTransform", ...values]);
    },
    getTransform() {
      const [a, b, c, d, e, f] = matrix;
      const det = a * d - b * c;
      return {
        a,
        b,
        c,
        d,
        e,
        f,
        inverse: () => ({
          a: d / det,
          b: -b / det,
          c: -c / det,
          d: a / det,
          e: (c * f - d * e) / det,
          f: (b * e - a * f) / det,
        }),
      };
    },
    beginPath: () => calls.push(["beginPath"]),
    closePath: () => calls.push(["closePath"]),
    moveTo: (x, y) => calls.push(["moveTo", x, y]),
    lineTo: (x, y) => calls.push(["lineTo", x, y]),
    rect: (...values) => calls.push(["rect", ...values]),
    roundRect: (...values) => calls.push(["roundRect", ...values]),
    arc: (x, y, r) => calls.push(["arc", x, y, r]),
    bezierCurveTo: (...values) => calls.push(["bezierCurveTo", ...values]),
    clip: () => calls.push(["clip", matrix]),
    fill: (shape) =>
      calls.push(["fill", ctx.fillStyle, ctx.globalAlpha, matrix, shape ? "path2d" : "current"]),
    stroke: () => calls.push(["stroke", ctx.strokeStyle, ctx.lineWidth]),
    fillText: (text, x, y) => calls.push(["fillText", text, x, y, ctx.fillStyle, ctx.font]),
    measureText: (text) => ({ width: text.length * 6 }),
    createPattern(source, repetition) {
      const pattern = { pattern: true, source, repetition };
      calls.push(["createPattern", pattern]);
      return pattern;
    },
  };
  return ctx;
}

const of = (ctx, name) => ctx.calls.filter((call) => call[0] === name);

test("the constants are the approved weights and sizes", () => {
  assert.deepEqual({ ...S.CHART }, { line: 1.5, rule: 1, dot: 4, ring: 2, focusDot: 5 });
  assert.equal(S.DITHER_MIN_HEIGHT, 24);
  assert.equal(S.CHART_WASH, 0.12);
});

test("a dot is radius 4 inside a 2 px ring of the card, filled by what it means", () => {
  for (const [kind, colour] of [
    ["answered", "success"],
    ["unknown", "warning"],
    ["plain", "quiet"],
    ["now", "honey"],
    ["selected", "honey"],
  ]) {
    const ctx = recorder();
    S.drawDot(ctx, 10, 20, kind, PALETTE);
    assert.deepEqual(of(ctx, "arc"), [
      ["arc", 10, 20, 6],
      ["arc", 10, 20, 4],
    ]);
    assert.deepEqual(
      of(ctx, "fill").map((call) => call[1]),
      ["card", colour],
      kind
    );
    assert.equal(of(ctx, "stroke").length, 0, kind);
  }
});

test("an open dot is a quiet ring, and a hedged one a soft warning fill inside a warning ring", () => {
  const open = recorder();
  S.drawDot(open, 0, 0, "open", PALETTE);
  assert.deepEqual(
    of(open, "fill").map((call) => call[1]),
    ["card"]
  );
  assert.deepEqual(of(open, "stroke"), [["stroke", "quiet", 1.5]]);
  assert.deepEqual(of(open, "arc").at(-1), ["arc", 0, 0, 3.25]);

  const hedged = recorder();
  S.drawDot(hedged, 0, 0, "hedged", PALETTE);
  const fills = of(hedged, "fill");
  assert.deepEqual(
    fills.map((call) => [call[1], call[2]]),
    [
      ["card", 1],
      ["warning", 0.35],
    ]
  );
  assert.deepEqual(of(hedged, "stroke"), [["stroke", "warning", 1.5]]);
  assert.equal(hedged.globalAlpha, 1, "the soft fill's opacity does not leak");
});

test("the dot being read takes a honey ring and keeps the surface inside it", () => {
  const ctx = recorder();
  S.drawDot(ctx, 5, 5, "open", PALETTE, S.CHART.focusDot, { focus: true });
  assert.deepEqual(
    of(ctx, "arc").map((call) => call[3]),
    [7, 5, 5, 4.25]
  );
  assert.deepEqual(
    of(ctx, "fill").map((call) => call[1]),
    ["honey", "card"]
  );
});

test("a dither fill is one pattern fill on device pixels, the field's mask for its density", () => {
  const ctx = recorder();
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  S.ditherFill(ctx, (c) => c.rect(0, 0, 10, 10), "quiet", 0.34);
  const fills = of(ctx, "fill");
  assert.equal(fills.length, 1);
  const [, pattern, , matrix] = fills[0];
  assert.equal(pattern.repetition, "repeat");
  // Traced under the context's scale, filled under none: one pattern pixel is
  // one device pixel at any ratio.
  assert.deepEqual(matrix, [1, 0, 0, 1, 0, 0]);
  const step = ditherStep(0.34);
  assert.deepEqual(
    [...pattern.source.lit].sort((a, b) => a - b),
    BAYER_4X4.map((rank, cell) => (rank < step ? cell : -1)).filter((cell) => cell >= 0)
  );
  assert.equal(pattern.source.color, "quiet");
  assert.deepEqual(ctx.getTransform().e, 0);
  assert.equal(ctx.getTransform().a, 2, "the context's own transform comes back");
});

test("patterns are made once per step and colour, and a density of nothing paints nothing", () => {
  const ctx = recorder();
  const fill = (density, colour) => S.ditherFill(ctx, (c) => c.rect(0, 0, 4, 4), colour, density);
  fill(0.5, "quiet");
  fill(0.5, "quiet");
  fill(0.51, "quiet");
  assert.equal(of(ctx, "createPattern").length, 1, "same step, same pattern");
  fill(0.5, "ink");
  fill(0.2, "quiet");
  assert.equal(of(ctx, "createPattern").length, 3);
  const before = of(ctx, "fill").length;
  fill(0, "quiet");
  fill(Number.NaN, "quiet");
  assert.equal(of(ctx, "fill").length, before);
});

test("an origin pins the pattern to a point, in whole device pixels", () => {
  const ctx = recorder();
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  S.ditherFill(ctx, (c) => c.rect(0, 0, 4, 4), "quiet", 0.5, { origin: { x: 10.3, y: -3 } });
  // 10.3 css = 20.6 device: 21, which is 1 into a 4-pixel tile; -3 css = -6: 2.
  assert.deepEqual(of(ctx, "fill")[0][3], [1, 0, 0, 1, 1, 2]);
});

test("a fade is one fill per step, sparsest first, each over its share of the shape", () => {
  const ctx = recorder();
  const bands = [];
  S.ditherFade(
    ctx,
    (c, start, end) => {
      bands.push([start, end]);
      c.rect(0, 0, 1, 1);
    },
    "quiet",
    0.5,
    0.08
  );
  const fills = of(ctx, "fill");
  assert.equal(fills.length, 8);
  const steps = fills.map((call) => call[1].source.lit.length);
  assert.deepEqual(steps, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(bands.every(([start]) => start === 0));
  assert.equal(bands[0][1], 1);
  for (let index = 1; index < bands.length; index += 1) {
    assert.ok(bands[index][1] < bands[index - 1][1], "each denser layer covers less");
  }
});

test("a density that varies is sampled once per 4x4 tile, clipped to the shape", () => {
  const ctx = recorder({ width: 16, height: 8 });
  const sampled = [];
  S.ditherFill(
    ctx,
    (c) => c.rect(0, 0, 16, 8),
    "quiet",
    (x, y) => {
      sampled.push([x, y]);
      return x < 8 ? 0.5 : 0.1;
    }
  );
  assert.equal(of(ctx, "clip").length, 1);
  // Two steps, two fills, each of a Path2D of tile runs.
  const fills = of(ctx, "fill");
  assert.equal(fills.length, 2);
  assert.ok(fills.every((call) => call[4] === "path2d"));
  // 16x8 pixels are eight tiles: a call per tile, at its centre, not per pixel.
  assert.deepEqual(sampled.map(([x, y]) => `${x},${y}`).sort(), [
    "10,2",
    "10,6",
    "14,2",
    "14,6",
    "2,2",
    "2,6",
    "6,2",
    "6,6",
  ]);
  assert.deepEqual(
    fills.map((call) => call[1].source.lit.length).sort((a, b) => a - b),
    [ditherStep(0.1), ditherStep(0.5)]
  );
});

test("the wash is the quiet grey at 12%, and nothing else keeps the opacity", () => {
  const ctx = recorder();
  S.washFill(ctx, (c) => c.rect(0, 0, 4, 4), "quiet");
  assert.deepEqual(
    of(ctx, "fill").map((call) => [call[1], call[2]]),
    [["quiet", 0.12]]
  );
  assert.equal(ctx.globalAlpha, 1);
});

test("a label sits on a plate in the card colour, cut to fit, and says where the plate is", () => {
  const ctx = recorder();
  const box = S.drawPlateText(ctx, "launch date", 100, 50, PALETTE, {
    align: "center",
    weight: 500,
    size: 12,
    maxWidth: 40,
  });
  const [roundRect] = of(ctx, "roundRect");
  const [plate, text] = of(ctx, "fill").concat(of(ctx, "fillText"));
  assert.equal(plate[1], "card");
  const [, shown, x, y, colour, font] = text;
  assert.ok(shown.endsWith("…") && shown.length * 6 <= 40, shown);
  assert.equal(colour, "ink");
  assert.equal(font, "500 12px Sans");
  assert.equal(y, 50);
  assert.equal(x, 100 - (shown.length * 6) / 2);
  assert.deepEqual(box, {
    left: roundRect[1],
    top: roundRect[2],
    right: roundRect[1] + roundRect[3],
    bottom: roundRect[2] + roundRect[4],
  });
  assert.equal(box.top, 50 - 6 - 3);
});

// A topic name runs to five words (topicNaming.mjs): too long for one line of
// a graph's label, and better in two than cut. Widths here are 6px a character.
test("a name too long for one line takes two, broken where they come out even", () => {
  const ctx = recorder();
  assert.deepEqual(S.balancedLines(ctx, "SOC 2 audit timeline", 180), ["SOC 2 audit timeline"]);
  // 32 characters, 192px: a greedy break would leave "rollback" alone.
  assert.deepEqual(S.balancedLines(ctx, "Data migration risk and rollback", 150), [
    "Data migration",
    "risk and rollback",
  ]);
  // On a tie the longer line goes first.
  assert.deepEqual(S.balancedLines(ctx, "Pellwood launch date decision", 150), [
    "Pellwood launch",
    "date decision",
  ]);
  // Japanese and Chinese break between characters; one long word does not break.
  assert.deepEqual(S.balancedLines(ctx, "発売日の変更について", 36), ["発売日の変", "更について"]);
  const [word] = S.balancedLines(ctx, "Fernbedienungsdesignbesprechung", 96);
  assert.ok(word.endsWith("…") && word.length * 6 <= 96, word);
  // Only a line still too wide is cut.
  const [first, second] = S.balancedLines(
    ctx,
    "One two three four five six seven eight nine ten",
    90
  );
  assert.ok(first.length * 6 <= 90 && second.length * 6 <= 90);
  assert.ok(second.endsWith("…"), second);
});

test("two lines sit on one plate, centred on the label's middle", () => {
  const ctx = recorder();
  const box = S.drawPlateLines(ctx, ["Data migration", "risk and rollback"], 100, 50, PALETTE, {
    align: "center",
    size: 12,
    lineHeight: 15,
  });
  assert.equal(of(ctx, "roundRect").length, 1, "one plate for both lines");
  const lines = of(ctx, "fillText");
  assert.deepEqual(
    lines.map(([, text, x, y]) => [text, x, y]),
    [
      ["Data migration", 100 - (14 * 6) / 2, 50 - 7.5],
      ["risk and rollback", 100 - (17 * 6) / 2, 50 + 7.5],
    ]
  );
  // As wide as the wider line, and as tall as both lines, padded as one line is.
  assert.deepEqual(box, {
    left: 100 - (17 * 6) / 2 - 4,
    right: 100 + (17 * 6) / 2 + 4,
    top: 50 - (12 + 15) / 2 - 3,
    bottom: 50 + (12 + 15) / 2 + 3,
  });
  // One line is the plate `drawPlateText` draws.
  const one = recorder();
  const single = S.drawPlateLines(one, ["launch date"], 100, 50, PALETTE, { align: "center" });
  const text = recorder();
  assert.deepEqual(
    single,
    S.drawPlateText(text, "launch date", 100, 50, PALETTE, { align: "center" })
  );
});

test("a monotone trace is one Bézier per piece, with its handles a third of the way", () => {
  const ctx = recorder();
  const points = [
    { x: 0, y: 10 },
    { x: 6, y: 4 },
    { x: 12, y: 8 },
  ];
  S.traceMonotone(ctx, points, [-1, 0, 2 / 3]);
  assert.deepEqual(of(ctx, "bezierCurveTo"), [
    ["bezierCurveTo", 2, 8, 4, 4, 6, 4],
    ["bezierCurveTo", 8, 4, 10, 8 - 4 / 3, 12, 8],
  ]);
});

// --- The contour and its legend, at source level -----------------------------

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const CONTOUR = code(read("src/components/conversation/ConversationContour.tsx"));
const LEGEND = code(read("src/components/conversation/ContourLegend.tsx"));

test("the contour draws through the chart style, with no opacity or dash of its own", () => {
  assert.match(CONTOUR, /from "\.\.\/charts\/chartStyle"/);
  assert.doesNotMatch(CONTOUR, /globalAlpha/);
  assert.doesNotMatch(CONTOUR, /setLineDash/);
  assert.doesNotMatch(CONTOUR, /getComputedStyle/);
  assert.match(CONTOUR, /subscribeChartPalette\(canvas, setPalette\)/);
});

test("a question is a dot on the line, with no stem and no second row", () => {
  assert.match(
    CONTOUR,
    /monotoneAt\(line, tangents, px\)[\s\S]*drawDot\(ctx, px, py, markKind\(mark\.state\), palette, radius, \{ focus: lit \}\)/
  );
  assert.match(CONTOUR, /const radius = lit \? CHART\.focusDot : CHART\.dot;/);
  assert.doesNotMatch(CONTOUR, /PIN_BAND|rows\[/);
});

test("the fill thins from 0.5 under the line to 0.08 at the baseline, and strips wash", () => {
  assert.match(CONTOUR, /const FILL_UNDER_LINE = 0\.5;/);
  assert.match(CONTOUR, /const FILL_AT_BASELINE = 0\.08;/);
  assert.match(
    CONTOUR,
    /cssHeight < DITHER_MIN_HEIGHT[\s\S]*washFill\(ctx, area, palette\.quiet\)/
  );
  assert.match(CONTOUR, /ditherFade\(/);
  // Live, the grain rolls with the line.
  assert.match(CONTOUR, /origin: \{ x: x\(contour\.sessionX \?\? 0\), y: 0 \}/);
});

test("returns are not drawn: the lanes show them", () => {
  assert.doesNotMatch(CONTOUR, /contour\.returns/);
  assert.doesNotMatch(LEGEND, /legend\.return|contour\.returns/);
});

test("a topic change is a quiet 1 px tick through the baseline; minute ticks are rules", () => {
  assert.match(
    CONTOUR,
    /strokeStyle = palette\.quiet;[\s\S]*contour\.shifts[\s\S]*baseline - 3\);[\s\S]*baseline \+ 4\);/
  );
  assert.match(CONTOUR, /strokeStyle = palette\.rule;[\s\S]*contour\.ticks/);
  assert.match(CONTOUR, /ctx\.lineWidth = CHART\.rule;/);
});

test("the legend is one row with only what the contour draws", () => {
  assert.equal((LEGEND.match(/<ul\b/g) ?? []).length, 1);
  const order = ["answered", "unknown", "hedged", "open"].map((kind) =>
    LEGEND.indexOf(`kind: "${kind}"`)
  );
  assert.ok(order.every((at, index) => at > 0 && (!index || at > order[index - 1])));
  assert.match(LEGEND, /hasShifts && \(/);
  assert.match(LEGEND, /hasMoments && \(/);
});
