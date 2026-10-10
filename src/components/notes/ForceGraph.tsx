import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import type { ThreadState } from "../../types/conversationEvents";
import {
  ALPHA_MIN,
  DRAG_ALPHA,
  NOT_DRAGGING,
  SETTLE_DECAY,
  SETTLE_GRAVITY_SCALE,
  SETTLE_REFERENCE_FRAME_MS,
  beginDrag,
  clampToCanvas,
  fitToCanvas,
  layout,
  radiusFor,
  releaseDrag,
  restDrag,
  settleToRest,
  simulationStep,
} from "./graphPhysics";
import type { DragLifecycle, GraphEdge, GraphNode, SimNode } from "./graphPhysics";

// The shapes are defined next to the simulation that consumes them, and
// re-exported here because this component is what every caller imports.
export type { GraphEdge, GraphNode };

// The Obsidian-style force-directed canvas shared by both graph surfaces: the
// topic graph inside one conversation (DESIGN.md §9.4) and the lifetime graph
// across all of them (§9.7). They differ only in what a node and an edge mean,
// so they differ only in the data handed to this component — one simulation, one
// set of interaction rules, one accessibility path.
//
// The simulation is capped and comes to rest (DESIGN.md §8): ~300 ticks with an
// alpha decay, then the canvas goes idle. No permanent jitter, no CPU burn
// behind a window somebody is reading. Dragging a node wakes it briefly.

/** Read live rather than cached: the OS setting can change while the app runs. */
function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
// Below this radius a node is too small to carry a label without the label
// becoming the node. A drawing rule, not a physical one, so it stays here.
const LABEL_RADIUS = 24;

// At or below this many nodes the graph is sparse enough that every node can be
// named without the map becoming text (DESIGN.md §9.4 wants whitespace over
// density — but a handful of unlabelled circles is not whitespace, it is a
// picture of nothing).
const SPARSE_GRAPH_NODES = 8;

// The same vocabulary as the live flow card (`ConversationFlow`): the topic
// being talked about now is the brand, an open one is neutral, a resolved one
// is green, and a dropped one is a hollow ring. Red is not used, because in
// Oats red means recording or danger (DESIGN.md §2). The fill or ring carries
// the state without colour, so it reads in greyscale.
const STATE_VAR: Record<ThreadState, string> = {
  live: "--color-primary",
  open: "--color-muted-foreground",
  resolved: "--color-success",
  dropped: "--color-muted-foreground",
};

function readColor(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim() || "#71717a";
}

// The palette is read on mount and whenever the theme changes — never inside the
// draw loop. `getComputedStyle` forces a style recalculation, and `draw` runs on
// every frame of a settle (~73 of them per drag), so reading it there billed a
// full recalc per frame for the length of every drag. CLAUDE.md records this
// exact mistake as a hard-won lesson from the retired field renderer; this is the same
// mistake in a different file.
interface Palette {
  ink: string;
  background: string;
  accent: string;
  sans: string;
  state: Record<ThreadState, string>;
}

// Canvas text does not inherit CSS, so the label font is read from the same
// token the DOM uses. Inter, like every other label in the app (DESIGN.md §3).
const SANS_FALLBACK = '"Inter Variable", ui-sans-serif, system-ui, sans-serif';

function readPalette(element: Element): Palette {
  const styles = getComputedStyle(element);
  return {
    ink: readColor(styles, "--color-foreground"),
    background: readColor(styles, "--color-surface-0"),
    accent: readColor(styles, "--color-primary"),
    sans: styles.getPropertyValue("--font-family-sans").trim() || SANS_FALLBACK,
    state: {
      live: readColor(styles, STATE_VAR.live),
      open: readColor(styles, STATE_VAR.open),
      resolved: readColor(styles, STATE_VAR.resolved),
      dropped: readColor(styles, STATE_VAR.dropped),
    },
  };
}

// A hand-arranged layout is a preference, not conversation data, so it lives in
// localStorage rather than on the note. Stored as fractions of the canvas so a
// resized window does not scatter it.
type StoredLayout = Record<number, { x: number; y: number }>;

function loadLayout(key: string | null): StoredLayout | null {
  if (!key || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StoredLayout) : null;
  } catch {
    return null;
  }
}

function saveLayout(key: string | null, nodes: SimNode[], width: number, height: number) {
  if (!key || typeof localStorage === "undefined" || !width || !height) return;
  try {
    const layoutData: StoredLayout = {};
    for (const node of nodes) layoutData[node.id] = { x: node.x / width, y: node.y / height };
    localStorage.setItem(key, JSON.stringify(layoutData));
  } catch {
    // A full or unavailable storage must never break the graph itself.
  }
}

/** Cuts a label to fit, ending in an ellipsis. */
function truncateLabel(ctx: CanvasRenderingContext2D, label: string, maxWidth: number): string {
  if (ctx.measureText(label).width <= maxWidth) return label;
  let text = label;
  while (text.length > 1 && ctx.measureText(`${text}…`).width > maxWidth) {
    text = text.slice(0, -1);
  }
  return `${text.trimEnd()}…`;
}

// Where a label sits under its node, and how much air it claims around itself.
// The gap is measured from the disc's edge; the pad is what the knockout plate
// adds either side so a hairline stops short of the first letter.
const LABEL_GAP = 6;
const LABEL_PAD = 5;
const LABEL_LINE = 15;

interface LabelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where a line leaving `node` toward (`x`, `y`) crosses the node's rim. */
function pointOnRim(node: SimNode, x: number, y: number): { x: number; y: number } {
  const dx = x - node.x;
  const dy = y - node.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= node.radius) return { x: node.x, y: node.y };
  return {
    x: node.x + (dx / distance) * node.radius,
    y: node.y + (dy / distance) * node.radius,
  };
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Would this label land on some *other* node's disc? */
function overlapsNode(box: LabelBox, nodes: SimNode[], ownId: number): boolean {
  return nodes.some((other) => {
    if (other.id === ownId) return false;
    // Nearest point of the box to the node's centre — a circle/rect test, so a
    // label passing beside a large disc is not rejected for being level with it.
    const nearestX = Math.max(box.left, Math.min(other.x, box.right));
    const nearestY = Math.max(box.top, Math.min(other.y, box.bottom));
    return Math.hypot(other.x - nearestX, other.y - nearestY) < other.radius + 2;
  });
}

/** A dropped topic: a hollow ring, so it reads as gone without colour. */
function drawHollow(
  ctx: CanvasRenderingContext2D,
  node: SimNode,
  color: string,
  background: string
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(node.x, node.y, node.radius - 0.75, 0, Math.PI * 2);
  ctx.fillStyle = background;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

export default function ForceGraph<TNode extends GraphNode>({
  nodes: inputNodes,
  edges,
  onSelect,
  selectedId,
  layoutKey = null,
  nodeDescription,
  className,
}: {
  nodes: TNode[];
  edges: GraphEdge[];
  onSelect?: (node: TNode | null) => void;
  selectedId?: number | null;
  layoutKey?: string | null;
  nodeDescription?: (node: TNode) => string;
  className?: string;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  // Grab offset and pin, as one value whose transitions live in `graphPhysics`.
  // The pin deliberately outlives the pointer; that rule is `releaseDrag`.
  const dragRef = useRef<DragLifecycle>(NOT_DRAGGING);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  // Mirrors node positions into React state purely so the accessible overlay
  // buttons can be positioned; the canvas itself never renders from this.
  const [placed, setPlaced] = useState<SimNode[]>([]);

  const maxDuration = useMemo(
    () => Math.max(...inputNodes.map((node) => node.durationMs), 1),
    [inputNodes]
  );

  // Read once on mount, then only when the theme actually changes. State rather
  // than a ref because `draw` genuinely has to be rebuilt when it changes — the
  // point is that it changes about twice in a session instead of 60 times a
  // second.
  const [palette, setPalette] = useState<Palette | null>(null);
  useEffect(() => {
    const target = canvasRef.current ?? document.documentElement;
    const reread = () => setPalette(readPalette(target));
    reread();
    const observer = new MutationObserver(reread);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Solve once per snapshot/size. The result is stored, not re-simulated on
  // every paint, so the canvas is idle whenever nobody is dragging.
  //
  // A layout the user has arranged by hand outranks the solver: positions are
  // restored as normalized fractions so they survive a resized window.
  useEffect(() => {
    if (!size.width || !size.height || !inputNodes.length) return;
    const saved = loadLayout(layoutKey);
    const golden = Math.PI * (3 - Math.sqrt(5));
    nodesRef.current = inputNodes.map((node, index) => {
      const angle = index * golden;
      const spread = Math.min(size.width, size.height) * 0.3;
      const offset = spread * Math.sqrt(index / inputNodes.length);
      const stored = saved?.[node.id];
      return {
        ...node,
        radius: radiusFor(node, maxDuration),
        x: stored ? stored.x * size.width : size.width / 2 + Math.cos(angle) * offset,
        y: stored ? stored.y * size.height : size.height / 2 + Math.sin(angle) * offset,
        vx: 0,
        vy: 0,
      };
    });
    if (!saved) layout(nodesRef.current, edges, size.width, size.height);
    fitToCanvas(nodesRef.current, size.width, size.height);
    setPlaced(nodesRef.current.map((node) => ({ ...node })));
  }, [inputNodes, edges, size, maxDuration, layoutKey]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !size.width || !size.height) return;
    if (!palette) return;

    // Clamped to 2 for the same reason the field clamps it: a 3× display turns a
    // full-width graph into ~9× the fragments for no visible gain on a 14px disc.
    // Assigning `width`/`height` *reallocates and clears* the backing store, so it
    // is done only when the size has actually changed — this used to run on every
    // frame of every settle, which on a Retina Mac is four times the pixels of the
    // Linux machine this was developed on.
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(size.width * ratio);
    const pixelHeight = Math.round(size.height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const { ink, background, accent } = palette;
    const nodes = nodesRef.current;
    const byId = new Map(nodes.map((node) => [node.id, node]));

    // Edges first, as hairline structure beneath the nodes.
    //
    // Every edge stops at the rim of the discs it joins rather than running to
    // their centres. A disc is drawn at 0.85 alpha and the uncertain states are
    // stippled, so a centre-to-centre line stayed visible *inside* the node as a
    // stub pointing at nothing — the picture read as circles with whiskers.
    for (const edge of edges) {
      const a = byId.get(edge.from);
      const b = byId.get(edge.to);
      if (!a || !b) continue;
      ctx.save();
      ctx.strokeStyle = ink;
      const recurring = edge.kind === "return" || edge.kind === "shared";
      ctx.globalAlpha = recurring ? 0.4 : 0.16;
      ctx.lineWidth = Math.min(1 + edge.weight * 0.4, 3);
      ctx.beginPath();
      if (recurring) {
        // Drawn as an arc so "this came back" reads as a distinct gesture rather
        // than just another line — in the topic graph a returned-to thread, in
        // the lifetime graph a subject two conversations shared.
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const length = Math.hypot(nx, ny) || 1;
        const cx = mx + (nx / length) * 34;
        const cy = my + (ny / length) * 34;
        // An arc leaves and arrives along the direction of its control point, so
        // trimming toward the control point is where it actually crosses the rim.
        const start = pointOnRim(a, cx, cy);
        const end = pointOnRim(b, cx, cy);
        ctx.moveTo(start.x, start.y);
        ctx.quadraticCurveTo(cx, cy, end.x, end.y);
      } else {
        const start = pointOnRim(a, b.x, b.y);
        const end = pointOnRim(b, a.x, a.y);
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    for (const node of nodes) {
      const color = palette.state[node.state] ?? palette.state.dropped;
      const selected = selectedId === node.id;
      if (node.state === "dropped") {
        drawHollow(ctx, node, color, background);
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.restore();
      }

      if (selected || hoveredId === node.id) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.lineWidth = selected ? 2 : 1;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Labels are a *second* pass over the same nodes, and everything about how
    // they read depends on that.
    //
    // Drawn inside the node loop, a label was painted before the discs that come
    // after it in the array, so any node overlapping it covered half its letters;
    // and every edge hairline ran straight through the glyphs, because edges are
    // painted first and text has no plate. Both produced the same symptom — text
    // that looks like it is floating loose over the picture rather than naming a
    // node. One pass for the structure, then one pass for the names.
    ctx.save();
    ctx.font = `500 12px ${palette.sans}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const claimed: LabelBox[] = [];
    const paintLabel = (node: SimNode, forced: boolean) => {
      // Truncate rather than pass a maxWidth: canvas *condenses* text to fit,
      // which turns a long conversation title into an illegible squeeze instead
      // of an honest ellipsis. How much survives depends on how much canvas
      // there is — the reading column keeps the old allowance, and the
      // full-bleed map, whose labels are conversation titles rather than
      // two-word topics, gets more of the title before the ellipsis.
      const text = truncateLabel(ctx, node.label, Math.min(240, Math.max(168, size.width / 6)));
      const width = ctx.measureText(text).width;
      const boxAt = (top: number): LabelBox => ({
        left: node.x - width / 2 - LABEL_PAD,
        top: top - 2,
        right: node.x + width / 2 + LABEL_PAD,
        bottom: top + LABEL_LINE,
      });
      // Under the node by preference, above it if that is where the room is. A
      // label that lands on another node's disc, or on a label already placed, is
      // worse than no label at all — but on a busy graph "below only" left most
      // of the map anonymous when a second position would have fit. Hovering or
      // selecting forces one through regardless, so nothing is unreachable.
      const below = node.y + node.radius + LABEL_GAP;
      const above = node.y - node.radius - LABEL_GAP - LABEL_LINE;
      const fits = (candidate: LabelBox) =>
        !overlapsNode(candidate, nodes, node.id) && !claimed.some((c) => overlaps(candidate, c));
      let top = below;
      let box = boxAt(below);
      if (!fits(box)) {
        const upper = boxAt(above);
        if (fits(upper)) {
          top = above;
          box = upper;
        } else if (!forced) {
          return;
        }
      }
      // The knockout: the hairlines beneath are structure, but a line crossing a
      // word is dirt. Painting the surface colour behind the text at just under
      // full strength keeps the edge legible as it approaches without letting it
      // cut the letters.
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = background;
      ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
      ctx.globalAlpha = forced ? 1 : 0.85;
      ctx.fillStyle = ink;
      ctx.fillText(text, node.x, top);
      claimed.push(box);
    };

    // The radius threshold exists to stop a dense graph turning into a wall of
    // text. On a small one there is no wall to prevent, and suppressing labels
    // there just makes the map unreadable — a four-topic conversation was
    // rendering two anonymous discs. Below this count every node is named;
    // above it, only the ones big enough to have earned it.
    const alwaysNamed = nodes.length <= SPARSE_GRAPH_NODES;
    // Biggest first, so when two labels compete for the same strip of canvas the
    // one belonging to the more important node wins rather than whichever
    // happened to be earlier in the array.
    const byImportance = [...nodes].sort((a, b) => b.radius - a.radius);
    for (const node of byImportance) {
      if (selectedId === node.id || hoveredId === node.id) continue;
      if (alwaysNamed || node.radius >= LABEL_RADIUS) paintLabel(node, false);
    }
    // Last, and therefore on top: whatever the user is pointing at or has chosen.
    for (const node of nodes) {
      if (selectedId === node.id || hoveredId === node.id) paintLabel(node, true);
    }
    ctx.restore();
  }, [edges, size, selectedId, hoveredId, palette]);

  // The running settle captured `draw` once, so a hover during a settle had its
  // highlight painted by React and immediately overwritten by the next tick's
  // stale copy. The loop reads the current one through a ref instead.
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw]);

  // Wake-and-settle.
  //
  // The simulation is otherwise a one-shot solve, which left dragging feeling
  // dead: the held node moved and every neighbour stayed frozen, so edges
  // stretched like rubber bands tied to statues. §8 asks for the opposite —
  // give, and then rest. This runs the same `simulationStep` as the initial
  // solve, reheated to DRAG_ALPHA and decaying to ALPHA_MIN, and then it
  // **stops**: no permanent jitter, and nothing running behind an idle window.
  const settleRef = useRef<{ raf: number; alpha: number; last: number } | null>(null);
  // Persisting is deferred until the graph actually stops, so what gets saved is
  // where it came to rest rather than wherever the pointer left it mid-settle.
  const onRestRef = useRef<(() => void) | null>(null);

  const stopSettling = useCallback(() => {
    if (!settleRef.current) return;
    cancelAnimationFrame(settleRef.current.raf);
    settleRef.current = null;
  }, []);

  const settle = useCallback(
    (onRest?: () => void) => {
      if (onRest) onRestRef.current = onRest;

      // Reduced motion gets the *destination*, not the absence of the
      // behaviour: the same steps run synchronously so neighbours still give
      // way, only the journey is skipped (§8, §12).
      //
      // `onRest` is what distinguishes a drag *move* from a drag *end*. Solving
      // on every move would run up to 300 ticks per pointer event — on the
      // lifetime graph that is millions of force evaluations a second, making
      // the accessible path the slowest one — and would re-solve to rest
      // continuously, ending somewhere different from the animated path.
      if (reducedMotion()) {
        if (!onRest) {
          drawRef.current();
          return;
        }
        settleToRest(nodesRef.current, edges, size.width, size.height, dragRef.current.pinned);
        drawRef.current();
        const rest = onRestRef.current;
        onRestRef.current = null;
        rest?.();
        return;
      }

      if (settleRef.current) {
        settleRef.current.alpha = DRAG_ALPHA;
        return;
      }

      const tick = (now: number) => {
        const state = settleRef.current;
        if (!state) return;

        if (state.alpha <= ALPHA_MIN) {
          stopSettling();
          drawRef.current();
          const rest = onRestRef.current;
          onRestRef.current = null;
          rest?.();
          return;
        }

        // Rebuilt every tick: the layout effect replaces nodesRef.current
        // whenever the inputs or the canvas size change, and a map captured once
        // would leave the spring forces acting on detached former nodes while
        // repulsion acted on the live ones — the graph collapses inward.
        const byId = new Map(nodesRef.current.map((node) => [node.id, node]));
        const delta = Math.min(now - state.last, 64);
        state.last = now;

        simulationStep(
          nodesRef.current,
          byId,
          edges,
          size.width,
          size.height,
          state.alpha,
          dragRef.current.pinned,
          SETTLE_GRAVITY_SCALE
        );
        state.alpha *= Math.pow(SETTLE_DECAY, delta / SETTLE_REFERENCE_FRAME_MS);
        drawRef.current();
        state.raf = requestAnimationFrame(tick);
      };

      const now = performance.now();
      settleRef.current = { raf: requestAnimationFrame(tick), alpha: DRAG_ALPHA, last: now };
    },
    [edges, size, stopSettling]
  );

  // If the component goes away mid-settle the rAF is cancelled and `onRest`
  // would never fire, so a drag followed by leaving the view within ~1s lost the
  // arrangement entirely. Run the pending persist on the way out.
  useEffect(
    () => () => {
      stopSettling();
      const rest = onRestRef.current;
      onRestRef.current = null;
      rest?.();
    },
    [stopSettling]
  );

  const nodeAt = useCallback((x: number, y: number) => {
    return (
      nodesRef.current.find((node) => Math.hypot(node.x - x, node.y - y) <= node.radius) ?? null
    );
  }, []);

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const { x, y } = pointAt(event);
      const node = nodeAt(x, y);
      onSelect?.((node as unknown as TNode) ?? null);
      if (!node) return;
      dragRef.current = beginDrag(node.id, node.x - x, node.y - y);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [nodeAt, onSelect]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const { x, y } = pointAt(event);
      const drag = dragRef.current.grab;
      if (!drag) {
        setHoveredId(nodeAt(x, y)?.id ?? null);
        return;
      }
      const node = nodesRef.current.find((candidate) => candidate.id === drag.id);
      if (!node) return;
      // The held node goes exactly where the hand puts it; the solver moves
      // everything else out of its way and settles again once it is let go.
      // Clamped by the *same* function the simulation uses, or the node jumps up
      // to ~54px sideways the instant the solver takes back over.
      const clamped = clampToCanvas(node, x + drag.dx, y + drag.dy, size.width, size.height);
      node.x = clamped.x;
      node.y = clamped.y;
      settle();
    },
    [nodeAt, size, settle]
  );

  const endDrag = useCallback(() => {
    if (!dragRef.current.grab) return;
    dragRef.current = releaseDrag(dragRef.current);
    // The node stays pinned *through* the release settle, and is only unpinned
    // once everything has come to rest.
    //
    // Releasing it at let-go was the rubber-banding: during the drag its
    // neighbours are pushed away, and the instant it stopped being pinned all of
    // that stored repulsion pushed straight back into it, undoing ~74% of the
    // displacement the hand had just made. Keeping it pinned means the drop
    // point is final and only the neighbours give way — which is what §9.4
    // promises when it says the map a user has arranged stays arranged.
    settle(() => {
      dragRef.current = restDrag();
      saveLayout(layoutKey, nodesRef.current, size.width, size.height);
      setPlaced(nodesRef.current.map((node) => ({ ...node })));
    });
  }, [layoutKey, size, settle]);

  return (
    <div ref={containerRef} className={cn("relative h-full w-full", className)}>
      <canvas
        ref={canvasRef}
        style={{ width: size.width, height: size.height }}
        className="touch-none"
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHoveredId(null)}
      />
      {/* The canvas cannot hold focusable children, so each topic also gets a
          transparent button over it. This is the keyboard and screen-reader path
          into the graph (DESIGN.md §12) — not a decorative duplicate. */}
      <ul className="pointer-events-none absolute inset-0 m-0 list-none p-0">
        {placed.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              onClick={() => onSelect?.(node as unknown as TNode)}
              onFocus={() => setHoveredId(node.id)}
              onBlur={() => setHoveredId(null)}
              aria-pressed={selectedId === node.id}
              // Deliberately NOT pointer-events-auto. These buttons sit exactly
              // over their node discs, so accepting pointer events made them
              // swallow every press before it reached the canvas — which meant
              // the canvas's onPointerDown never fired and dragging a node was
              // impossible with a mouse. The canvas already handles pointer
              // selection and dragging; this layer exists purely so the graph is
              // reachable by keyboard and legible to a screen reader, and it
              // still receives focus, Enter/Space, and its focus ring.
              className="pointer-events-none absolute rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                left: node.x - node.radius,
                top: node.y - node.radius,
                width: node.radius * 2,
                height: node.radius * 2,
              }}
            >
              <span className="sr-only">
                {nodeDescription
                  ? nodeDescription(node as unknown as TNode)
                  : t("topicGraph.node", {
                      label: node.label,
                      seconds: Math.max(1, Math.round(node.durationMs / 1000)),
                    })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
