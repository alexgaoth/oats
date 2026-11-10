const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Pointer targets are at least 24x24 CSS pixels (the taste document, §11). The
// 2026-11-08 screen audit measured five that were not: the switch (36x20), the
// sidebar's grain (20x20), the error toast's Copy (22x22), a voice's Name in
// the transcript (20 tall) and the smallest disc of a force graph (a 22.6px
// reach). Each keeps its drawing and its box; an invisible margin, or a wider
// hit radius on the canvas, makes the target.

const ROOT = path.join(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const PX = { 0.5: 2, px: 1 };
/** The target a box of `width`x`height` reaches with a Tailwind `after:-inset-*` margin. */
function reach(className, width, height) {
  const all = /after:-inset-(0\.5|px)(?![-\w])/.exec(className);
  const y = /after:-inset-y-(0\.5|px)(?![-\w])/.exec(className);
  const x = /after:-inset-x-(0\.5|px)(?![-\w])/.exec(className);
  const dx = PX[(all ?? x)?.[1]] ?? 0;
  const dy = PX[(all ?? y)?.[1]] ?? 0;
  assert.match(className, /\brelative\b/, "the margin is placed against the control");
  assert.match(className, /after:absolute/);
  return [width + 2 * dx, height + 2 * dy];
}

const classOf = (source, anchor) => {
  const at = source.indexOf(anchor);
  assert.ok(at >= 0, `${anchor} is in the source`);
  return source.slice(at, source.indexOf("\n", at));
};

test("the switch, 36x20, is a 36x24 target", () => {
  const line = classOf(read("src/components/ui/toggle.tsx"), "className={`peer");
  assert.match(line, /h-5 w-9/);
  const [w, h] = reach(line, 36, 20);
  assert.ok(w >= 24 && h >= 24, `${w}x${h}`);
});

test("the sidebar's grain, 20x20, is a 24x24 target", () => {
  const line = classOf(read("src/components/shell/OatsMark.tsx"), '"relative inline-flex size-5');
  const [w, h] = reach(line, 20, 20);
  assert.ok(w >= 24 && h >= 24, `${w}x${h}`);
});

test("an error toast's Copy, 22x22, is a 24x24 target", () => {
  const source = read("src/components/ui/Toast.tsx");
  const line = classOf(source, 'className="relative -mr-1 -mt-0.5 shrink-0 rounded-md p-1');
  assert.match(
    source,
    /onClick=\{handleCopyError\}\s+aria-label=\{t\("common\.copy"\)\}\s+className="relative/
  );
  const [w, h] = reach(line, 22, 22);
  assert.ok(w >= 24 && h >= 24, `${w}x${h}`);
});

test("a voice's Name, one 20px line, is at least 24x24", () => {
  const line = classOf(
    read("src/components/conversation/Transcript.tsx"),
    'className="relative min-w-6'
  );
  const [w, h] = reach(line, 24, 20);
  assert.ok(w >= 24 && h >= 24, `${w}x${h}`);
});

test("a dialog's Close is 24x24 with its icon where it was", () => {
  const line = classOf(read("src/components/ui/dialog.tsx"), "<DialogPrimitive.Close className=");
  assert.match(line, /\bsize-6\b/);
  // A 16px icon centred in 24px sits 4px in: right-3/top-3 (12px) keeps it 16px from the corner.
  assert.match(line, /\bright-3 top-3\b/);
  assert.match(line, /items-center justify-center/);
});

test("a force graph's smallest disc is a 24px target, nearest disc first", () => {
  const graph = read("src/components/notes/ForceGraph.tsx");
  const physics = read("src/components/notes/graphPhysics.ts");
  const minRadius = Number(/export const MIN_RADIUS = (\d+)/.exec(physics)[1]);
  const slop = Number(/const HIT_SLOP = (\d+)/.exec(graph)[1]);
  const floor = Number(/const MIN_HIT_RADIUS = (\d+)/.exec(graph)[1]);
  assert.match(graph, /const reach = Math\.max\(node\.radius \+ HIT_SLOP, MIN_HIT_RADIUS\)/);
  assert.match(graph, /distance <= reach && distance < bestDistance/);
  assert.ok(2 * Math.max(minRadius + slop, floor) >= 24);
});
