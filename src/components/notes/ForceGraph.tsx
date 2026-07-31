import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import type { ThreadState } from "../../types/conversationEvents";

// The least a node needs for this canvas to lay it out and draw it. Both graph
// surfaces supply richer objects; everything extra rides along untouched so the
// caller gets its own type back in `onSelect`.
export interface GraphNode {
  id: number;
  label: string;
  durationMs: number;
  state: ThreadState;
}

export interface GraphEdge {
  from: number;
  to: number;
  weight: number;
  // `return` and `shared` both draw as the curved, higher-contrast edge: in both
  // graphs they mean "this came back", which is the mark worth noticing.
  kind: string;
}

// The Obsidian-style force-directed canvas shared by both graph surfaces: the
// topic graph inside one conversation (DESIGN.md §9.4) and the lifetime graph
// across all of them (§9.7). They differ only in what a node and an edge mean,
// so they differ only in the data handed to this component — one simulation, one
// set of interaction rules, one accessibility path.
//
// The simulation is capped and comes to rest (DESIGN.md §8): ~300 ticks with an
// alpha decay, then the canvas goes idle. No permanent jitter, no CPU burn
// behind a window somebody is reading. Dragging a node wakes it briefly.

const MAX_TICKS = 300;
const ALPHA_DECAY = 0.985;
const ALPHA_MIN = 0.005;

// Dragging reheats the simulation so neighbours give way and the graph re-settles
// (DESIGN.md §8: "Dragging a node wakes it briefly and it settles again"). Held
// below 1 so a drag nudges the arrangement rather than re-solving it from
// scratch and throwing away what the user has laid out.
const DRAG_ALPHA = 0.34;
// Decay per 16.7ms of wall clock, applied against the real frame delta so the
// settle takes the same time on a 60Hz and a 120Hz display.
const SETTLE_DECAY = 0.94;
const SETTLE_REFERENCE_FRAME_MS = 1000 / 60;
// A settle must not drag the arrangement back toward the middle. Centre gravity
// is what pulls the whole constellation in, and re-applying it at full strength
// on every drag walked hand-placed nodes ~90px per settle and ~190px over five
// — which contradicts §9.4's promise that "the map a user has arranged stays
// arranged". During a settle it is nearly off: enough to stop nodes drifting
// off-canvas, not enough to re-solve the layout.
const SETTLE_GRAVITY_SCALE = 0.08;

/** Read live rather than cached: the OS setting can change while the app runs. */
function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
const MIN_RADIUS = 14;
const MAX_RADIUS = 42;
const LABEL_RADIUS = 24;

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const STATE_VAR: Record<ThreadState, string> = {
  live: "--graph-uncertain",
  open: "--graph-open",
  resolved: "--graph-answered",
  dropped: "--graph-silence",
};

// Dither density encodes uncertainty (DESIGN.md §4): a resolved thread is solid,
// a dropped one is barely there. Drawn as a stipple so it survives greyscale.
const STATE_DITHER: Record<ThreadState, number> = {
  live: 0,
  open: 0.45,
  resolved: 0,
  dropped: 0.7,
};

function readColor(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim() || "#6B6459";
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

// Labels are centred mono text drawn under each node, so the layout has to keep
// nodes far enough from the edges for the *label* to fit rather than the disc.
// Half of a comfortable label width, plus a line's height below.
const LABEL_CLEARANCE_X = 68;
const LABEL_CLEARANCE_Y = 26;

/**
 * Centre and scale the settled graph so it uses the space it has been given.
 *
 * The solver's weak centre gravity reliably parks a small graph in one corner of
 * a large canvas, which reads as a rendering accident rather than as a map. This
 * only ever moves the whole constellation — relative positions, and therefore
 * any arrangement the user has dragged into place, are preserved exactly.
 */
function fitToCanvas(nodes: SimNode[], width: number, height: number): void {
  if (nodes.length < 2 || !width || !height) return;

  const padX = Math.max(LABEL_CLEARANCE_X, 24);
  const padY = LABEL_CLEARANCE_Y + 12;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.radius);
    maxX = Math.max(maxX, node.x + node.radius);
    minY = Math.min(minY, node.y - node.radius);
    maxY = Math.max(maxY, node.y + node.radius);
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX <= 0 || spanY <= 0) return;

  // Modest magnification only. A four-node graph left at solver scale in a tall
  // container reads as a layout bug, but blown up to fill a wall it stops being
  // calm — §9.4 wants whitespace over density, not emptiness.
  const scale = Math.min(1.5, (width - padX * 2) / spanX, (height - padY * 2) / spanY);
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;

  for (const node of nodes) {
    node.x = width / 2 + (node.x - centreX) * scale;
    node.y = height / 2 + (node.y - centreY) * scale;
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

// Radius scales with the square root of time spent, clamped to a 3× range so one
// long tangent cannot swallow the map.
function radiusFor(node: GraphNode, maxDuration: number): number {
  if (maxDuration <= 0) return MIN_RADIUS;
  const ratio = Math.sqrt(Math.max(node.durationMs, 0) / maxDuration);
  return MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS);
}

/**
 * Advance the simulation by one tick.
 *
 * Split out of `layout` so the initial solve and the live settle after a drag
 * run the *same* forces — a drag that behaved differently from the solver would
 * be a second physics to learn.
 *
 * `pinned` is the node under the pointer: it takes part in the forces acting on
 * everything else but is never moved by them, so it stays exactly where the
 * hand put it while its neighbours give way.
 */
function simulationStep(
  nodes: SimNode[],
  byId: Map<number, SimNode>,
  edges: GraphEdge[],
  width: number,
  height: number,
  alpha: number,
  pinned: number | null,
  gravityScale = 1
) {
  // Repulsion between every pair — n is small (topics, not utterances), so the
  // naive O(n²) pass is cheaper than building a quadtree.
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.hypot(dx, dy) || 0.01;
      const minimum = a.radius + b.radius + 28;
      const force = ((minimum * minimum) / (distance * distance)) * alpha * 0.9;
      dx /= distance;
      dy /= distance;
      a.vx -= dx * force;
      a.vy -= dy * force;
      b.vx += dx * force;
      b.vy += dy * force;
    }
  }
  for (const edge of edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy) || 0.01;
    const rest = a.radius + b.radius + 90;
    const force = ((distance - rest) / distance) * alpha * 0.08 * Math.min(edge.weight, 4);
    a.vx += dx * force;
    a.vy += dy * force;
    b.vx -= dx * force;
    b.vy -= dy * force;
  }
  for (const node of nodes) {
    if (node.id === pinned) {
      // Held by the pointer: it pushes, but nothing pushes it.
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx += (width / 2 - node.x) * alpha * 0.012 * gravityScale;
    node.vy += (height / 2 - node.y) * alpha * 0.012 * gravityScale;
    node.vx *= 0.82;
    node.vy *= 0.82;
    // Leave room for the label, not just the disc. A node parked against the
    // right edge is legible; its centred mono label underneath is not — it
    // runs off the canvas and gets clipped mid-word.
    const sideRoom = Math.max(node.radius + 8, LABEL_CLEARANCE_X);
    node.x = Math.max(sideRoom, Math.min(width - sideRoom, node.x + node.vx));
    node.y = Math.max(
      node.radius + 8,
      Math.min(height - node.radius - LABEL_CLEARANCE_Y, node.y + node.vy)
    );
  }
}

/** The initial solve: run to rest, synchronously, then stop (DESIGN.md §8). */
function layout(nodes: SimNode[], edges: GraphEdge[], width: number, height: number) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let alpha = 1;
  for (let tick = 0; tick < MAX_TICKS && alpha > ALPHA_MIN; tick += 1) {
    simulationStep(nodes, byId, edges, width, height, alpha, null);
    alpha *= ALPHA_DECAY;
  }
}

function drawDither(
  ctx: CanvasRenderingContext2D,
  node: SimNode,
  density: number,
  background: string
) {
  if (density <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = background;
  const step = 3;
  // Ordered 4×4 Bayer thresholding — crisp and pixel-locked, never blurred noise.
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = node.y - node.radius; y < node.y + node.radius; y += step) {
    for (let x = node.x - node.radius; x < node.x + node.radius; x += step) {
      const bx = Math.abs(Math.round(x / step)) % 4;
      const by = Math.abs(Math.round(y / step)) % 4;
      if (bayer[by * 4 + bx] / 16 < density) ctx.fillRect(x, y, step - 1, step - 1);
    }
  }
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
  const dragRef = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  // Mirrors node positions into React state purely so the accessible overlay
  // buttons can be positioned; the canvas itself never renders from this.
  const [placed, setPlaced] = useState<SimNode[]>([]);

  const maxDuration = useMemo(
    () => Math.max(...inputNodes.map((node) => node.durationMs), 1),
    [inputNodes]
  );

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
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size.width * ratio;
    canvas.height = size.height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const styles = getComputedStyle(canvas);
    const ink = readColor(styles, "--color-foreground");
    const background = readColor(styles, "--color-surface-0");
    const accent = readColor(styles, "--color-primary");
    const nodes = nodesRef.current;
    const byId = new Map(nodes.map((node) => [node.id, node]));

    // Edges first, as hairline structure beneath the nodes.
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
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx + (nx / length) * 34, my + (ny / length) * 34, b.x, b.y);
      } else {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    for (const node of nodes) {
      const color = readColor(styles, STATE_VAR[node.state] ?? "--graph-silence");
      const selected = selectedId === node.id;
      ctx.save();
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.restore();

      drawDither(ctx, node, STATE_DITHER[node.state] ?? 0, background);

      if (selected || hoveredId === node.id) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.lineWidth = selected ? 2 : 1;
        ctx.stroke();
        ctx.restore();
      }

      // Labels only where they fit, plus whatever is hovered or selected —
      // whitespace over density.
      const forced = selected || hoveredId === node.id;
      // A label that lands on top of another node is worse than no label at
      // all. Hovering or selecting still forces it, so nothing is unreachable.
      const labelY = node.y + node.radius + 12;
      const labelCollides =
        !forced &&
        nodes.some(
          (other) =>
            other.id !== node.id &&
            Math.abs(other.x - node.x) < other.radius + 34 &&
            Math.abs(other.y - labelY) < other.radius + 6
        );
      if ((node.radius >= LABEL_RADIUS && !labelCollides) || forced) {
        ctx.save();
        ctx.fillStyle = ink;
        ctx.globalAlpha = 0.75;
        ctx.font = '11px ui-monospace, "SF Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        // Truncate rather than pass a maxWidth: canvas *condenses* text to fit,
        // which turns a long conversation title into an illegible squeeze
        // instead of an honest ellipsis.
        ctx.fillText(truncateLabel(ctx, node.label, 168), node.x, node.y + node.radius + 6);
        ctx.restore();
      }
    }
  }, [edges, size, selectedId, hoveredId]);

  useEffect(() => {
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
          draw();
          return;
        }
        const byId = new Map(nodesRef.current.map((node) => [node.id, node]));
        let alpha = DRAG_ALPHA;
        for (let tick = 0; tick < MAX_TICKS && alpha > ALPHA_MIN; tick += 1) {
          simulationStep(
            nodesRef.current,
            byId,
            edges,
            size.width,
            size.height,
            alpha,
            dragRef.current?.id ?? null,
            SETTLE_GRAVITY_SCALE
          );
          alpha *= SETTLE_DECAY;
        }
        draw();
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
          draw();
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
          dragRef.current?.id ?? null,
          SETTLE_GRAVITY_SCALE
        );
        state.alpha *= Math.pow(SETTLE_DECAY, delta / SETTLE_REFERENCE_FRAME_MS);
        draw();
        state.raf = requestAnimationFrame(tick);
      };

      const now = performance.now();
      settleRef.current = { raf: requestAnimationFrame(tick), alpha: DRAG_ALPHA, last: now };
    },
    [draw, edges, size, stopSettling]
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
      dragRef.current = { id: node.id, dx: node.x - x, dy: node.y - y };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [nodeAt, onSelect]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const { x, y } = pointAt(event);
      const drag = dragRef.current;
      if (!drag) {
        setHoveredId(nodeAt(x, y)?.id ?? null);
        return;
      }
      const node = nodesRef.current.find((candidate) => candidate.id === drag.id);
      if (!node) return;
      // The held node goes exactly where the hand puts it; the solver moves
      // everything else out of its way and settles again once it is let go.
      // Same bounds as simulationStep, or the node jumps up to ~54px sideways
      // the instant the solver takes back over.
      const sideRoom = Math.max(node.radius + 8, LABEL_CLEARANCE_X);
      node.x = Math.max(sideRoom, Math.min(size.width - sideRoom, x + drag.dx));
      node.y = Math.max(
        node.radius + 8,
        Math.min(size.height - node.radius - LABEL_CLEARANCE_Y, y + drag.dy)
      );
      settle();
    },
    [nodeAt, size, settle]
  );

  const endDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    // Unpin and persist only once it has actually stopped. A fixed timer was
    // both wrong (the settle outlived it) and a leak (it fired after unmount).
    settle(() => {
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
