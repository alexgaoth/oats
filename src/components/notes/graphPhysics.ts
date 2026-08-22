import type { ThreadState } from "../../types/conversationEvents";

// The force simulation behind both graph surfaces — the topic graph inside one
// conversation (DESIGN.md §9.4) and the lifetime graph across all of them (§9.7).
//
// Pure and DOM-free, on purpose and for the same reason `conversationContour.mjs` is:
// the interesting claims about a graph are claims about where the nodes end up,
// and those cannot be checked through a canvas. `ForceGraph.tsx` owns pointers,
// palette and painting; everything here is arithmetic.

/** The least a node needs for this simulation to lay it out. */
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
  // `return` and `shared` both mean "this came back" — the mark worth noticing.
  kind: string;
}

export interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export const MAX_TICKS = 300;
export const ALPHA_DECAY = 0.985;
export const ALPHA_MIN = 0.005;

// Dragging reheats the simulation so neighbours give way and the graph
// re-settles (§8: "Dragging a node wakes it briefly and it settles again"). Held
// below 1 so a drag nudges the arrangement rather than re-solving it from
// scratch and throwing away what the user has laid out.
export const DRAG_ALPHA = 0.34;
// Decay per 16.7ms of wall clock, applied against the real frame delta so the
// settle takes the same time on a 60Hz and a 120Hz display.
export const SETTLE_DECAY = 0.94;
export const SETTLE_REFERENCE_FRAME_MS = 1000 / 60;
// A settle must not drag the arrangement back toward the middle. Centre gravity
// is what pulls the whole constellation in, and re-applying it at full strength
// on every drag walked hand-placed nodes ~90px per settle and ~190px over five —
// which contradicts §9.4's promise that "the map a user has arranged stays
// arranged". During a settle it is nearly off: enough to stop nodes drifting
// off-canvas, not enough to re-solve the layout.
export const SETTLE_GRAVITY_SCALE = 0.08;

export const MIN_RADIUS = 14;
export const MAX_RADIUS = 42;

// The air two discs must keep between them. Enforced as a constraint by
// `separate`, not as a force — see the note there.
export const NODE_GAP = 6;

// How far `fitToCanvas` may magnify a settled constellation. See the note there:
// the ceiling exists so a sparse graph is spread, not exploded.
export const MAX_FIT_SCALE = 2.6;

// Labels are centred mono text drawn under each node, so the layout has to keep
// nodes far enough from the edges for the *label* to fit rather than the disc.
// Half of a comfortable label width, plus a line's height below.
export const LABEL_CLEARANCE_X = 68;
export const LABEL_CLEARANCE_Y = 26;

// Radius scales with the square root of time spent, clamped to a 3× range so one
// long tangent cannot swallow the map.
export function radiusFor(node: GraphNode, maxDuration: number): number {
  if (maxDuration <= 0) return MIN_RADIUS;
  const ratio = Math.sqrt(Math.max(node.durationMs, 0) / maxDuration);
  return MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS);
}

/**
 * Where a node is allowed to be.
 *
 * Shared by the simulation and by pointer dragging, because they disagreeing is
 * visible: the held node used to be clamped differently from the solved one, so
 * it jumped up to ~54px sideways the instant the solver took back over.
 */
export function clampToCanvas(
  node: SimNode,
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  const sideRoom = Math.max(node.radius + 8, LABEL_CLEARANCE_X);
  return {
    x: Math.max(sideRoom, Math.min(width - sideRoom, x)),
    y: Math.max(node.radius + 8, Math.min(height - node.radius - LABEL_CLEARANCE_Y, y)),
  };
}

/**
 * Who the solver must leave alone, and for how long.
 *
 * The subtle part is that the pin **outlives the pointer**. During a drag the
 * neighbours are pushed away from the held node; if the pin is dropped the
 * instant the button comes up, all of that stored repulsion pushes straight back
 * into it and the node rubber-bands toward where it came from. Holding the pin
 * until the graph has come to rest makes the drop point final and lets only the
 * neighbours give way — §9.4's "the map a user has arranged stays arranged".
 *
 * That rule is a policy, not arithmetic, so it lives here where it can be tested
 * rather than inside the component's event handlers where it cannot.
 */
export interface DragLifecycle {
  /** The pointer's grab offset, while a button is down. */
  grab: { id: number; dx: number; dy: number } | null;
  /** The node the solver must not move. Outlives `grab`. */
  pinned: number | null;
}

export const NOT_DRAGGING: DragLifecycle = { grab: null, pinned: null };

/** Pointer down on a node: it is both grabbed and pinned. */
export function beginDrag(id: number, dx: number, dy: number): DragLifecycle {
  return { grab: { id, dx, dy }, pinned: id };
}

/** Pointer up: the grab ends, the pin does not. */
export function releaseDrag(state: DragLifecycle): DragLifecycle {
  return { grab: null, pinned: state.pinned };
}

/** The settle finished: now, and only now, the node rejoins the simulation. */
export function restDrag(): DragLifecycle {
  return NOT_DRAGGING;
}

/**
 * Advance the simulation by one tick.
 *
 * Split out of `layout` so the initial solve and the live settle after a drag run
 * the *same* forces — a drag that behaved differently from the solver would be a
 * second physics to learn.
 *
 * `pinned` is the node the user is responsible for: it takes part in the forces
 * acting on everything else but is never moved by them. It stays pinned for the
 * whole of the release settle, not just while the button is down — see
 * `ForceGraph.tsx`'s `endDrag`.
 */
export function simulationStep(
  nodes: SimNode[],
  byId: Map<number, SimNode>,
  edges: GraphEdge[],
  width: number,
  height: number,
  alpha: number,
  pinned: number | null,
  gravityScale = 1
): void {
  // Repulsion between every pair — n is small (topics, not utterances), so the
  // naive O(n²) pass is cheaper than building a quadtree.
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.01;
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
      // The user's hand is the authority on this one: it pushes, nothing pushes it.
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx += (width / 2 - node.x) * alpha * 0.012 * gravityScale;
    node.vy += (height / 2 - node.y) * alpha * 0.012 * gravityScale;
    node.vx *= 0.82;
    node.vy *= 0.82;
    const clamped = clampToCanvas(node, node.x + node.vx, node.y + node.vy, width, height);
    node.x = clamped.x;
    node.y = clamped.y;
  }

  separate(nodes, width, height, pinned);
}

/**
 * Push apart any two discs that are touching.
 *
 * Repulsion alone cannot promise this. It is a force, so it settles wherever it
 * balances centre gravity, and on a busy conversation in the reading column that
 * balance point is *inside* the neighbouring disc: twelve topics rendered as a
 * pile of overlapping circles with the labels of whichever ones happened to have
 * room. Separation is a constraint rather than a force — applied to positions
 * after the integration step, unscaled by alpha — so "discs do not overlap" holds
 * at rest instead of being approached asymptotically.
 *
 * The pinned node is never moved: the hand outranks the constraint, and its
 * neighbours are the ones that give way.
 */
export function separate(
  nodes: SimNode[],
  width: number,
  height: number,
  pinned: number | null
): void {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.01;
      const minimum = a.radius + b.radius + NODE_GAP;
      if (distance >= minimum) continue;
      const overlap = minimum - distance;
      const ux = dx / distance;
      const uy = dy / distance;
      const aFixed = a.id === pinned;
      const bFixed = b.id === pinned;
      if (aFixed && bFixed) continue;
      // A pinned node takes none of the correction, so its partner takes all.
      const aShare = aFixed ? 0 : bFixed ? 1 : 0.5;
      const bShare = bFixed ? 0 : aFixed ? 1 : 0.5;
      if (aShare) {
        const moved = clampToCanvas(
          a,
          a.x - ux * overlap * aShare,
          a.y - uy * overlap * aShare,
          width,
          height
        );
        a.x = moved.x;
        a.y = moved.y;
      }
      if (bShare) {
        const moved = clampToCanvas(
          b,
          b.x + ux * overlap * bShare,
          b.y + uy * overlap * bShare,
          width,
          height
        );
        b.x = moved.x;
        b.y = moved.y;
      }
    }
  }
}

/** The initial solve: run to rest, synchronously, then stop (DESIGN.md §8). */
export function layout(nodes: SimNode[], edges: GraphEdge[], width: number, height: number): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let alpha = 1;
  for (let tick = 0; tick < MAX_TICKS && alpha > ALPHA_MIN; tick += 1) {
    simulationStep(nodes, byId, edges, width, height, alpha, null);
    alpha *= ALPHA_DECAY;
  }
}

/**
 * Run a whole settle to rest in one call.
 *
 * The animated path in `ForceGraph.tsx` spreads exactly these steps over frames;
 * this is the same sequence with the waiting taken out, which is both what the
 * reduced-motion path uses and what makes the settle's *outcome* testable.
 */
export function settleToRest(
  nodes: SimNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  pinned: number | null
): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let alpha = DRAG_ALPHA;
  for (let tick = 0; tick < MAX_TICKS && alpha > ALPHA_MIN; tick += 1) {
    simulationStep(nodes, byId, edges, width, height, alpha, pinned, SETTLE_GRAVITY_SCALE);
    alpha *= SETTLE_DECAY;
  }
}

/**
 * Centre and scale the settled graph so it uses the space it has been given.
 *
 * The solver's weak centre gravity reliably parks a small graph in one corner of
 * a large canvas, which reads as a rendering accident rather than as a map. This
 * only ever moves the whole constellation — relative positions, and therefore any
 * arrangement the user has dragged into place, are preserved exactly.
 */
export function fitToCanvas(nodes: SimNode[], width: number, height: number): void {
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

  // The magnification is bounded by the container on both axes, and then by
  // MAX_FIT_SCALE so a two-node graph never becomes two dinner plates at
  // opposite ends of a wall.
  //
  // The old ceiling of 1.5 was set against the reading column, where it never
  // binds. On the full-bleed lifetime map it binds immediately: three
  // conversations sat as a 200px knot in the middle of a 1500px canvas, which
  // reads as a rendering accident rather than as a map — the exact failure this
  // function exists to prevent. §9.4 wants whitespace over density, not
  // emptiness, and a graph using a seventh of its canvas is emptiness.
  const scale = Math.min(MAX_FIT_SCALE, (width - padX * 2) / spanX, (height - padY * 2) / spanY);
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;

  for (const node of nodes) {
    node.x = width / 2 + (node.x - centreX) * scale;
    node.y = height / 2 + (node.y - centreY) * scale;
  }
}
