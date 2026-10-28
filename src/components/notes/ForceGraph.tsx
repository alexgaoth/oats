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
import {
  CHART,
  balancedLines,
  ditherFill,
  drawPlateLines,
  drawPlateText,
  fitText,
  subscribeChartPalette,
} from "../charts/chartStyle";
import type { ChartPalette, PlateBox } from "../charts/chartStyle";
import { edgeKey } from "../global/arcGeometry";
import { NO_HIGHLIGHT, lineTone, markTone } from "../global/linkedHighlight";
import type { Highlight } from "../global/linkedHighlight";
import type { HighlightSource } from "../global/highlightStore";

// The shapes are defined next to the simulation that consumes them, and
// re-exported here because this component is what every caller imports.
export type { GraphEdge, GraphNode };

// The force-directed canvas shared by both graph surfaces: the topic graph
// inside one conversation and the force graph of Global conversations across
// all of them. They differ only in what a node and an edge mean, so they
// differ only in the data handed to this component: one simulation, one set
// of interaction rules, one accessibility path.
//
// Drawn by the chart rules (DESIGN.md §6, `charts/chartStyle.ts`): discs of 5
// to 14 px dithered in the quiet grey, edges 1.5 px and straight, labels on
// plates in the surface colour, and honey only for the disc that is pointed at
// or selected.
//
// The simulation is capped and comes to rest (DESIGN.md §7): ~300 ticks with an
// alpha decay, then the canvas goes idle. Dragging a node wakes it briefly.
// Nothing else redraws it but a change of data, size, theme or highlight, and
// a highlight redraw composites cached layers rather than repainting the graph.

/** Read live rather than cached: the OS setting can change while the app runs. */
function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

// How dense a disc's dither is says how settled its topic is, so the state
// survives greyscale: an open topic is half ink, a resolved one nearly solid, a
// dropped one an empty ring. The topic being talked about now is honey (it is
// "now"). A conversation on the board is always `open`: its size is its data.
const DENSITY: Record<ThreadState, number> = {
  live: 1,
  open: 0.62,
  resolved: 0.9,
  dropped: 0,
};

// A press that moves less than this is a click, not a drag.
const DRAG_SLOP = 4;
// Discs are small; the pointer may land this far outside one and still have it.
const HIT_SLOP = 4;
// Edges stop this far short of the discs they join.
const EDGE_GAP = 3;
// Under a disc, the gap between its rim and its label's plate.
const LABEL_GAP = 4;
// A label: 12 px, on a plate 4 px wider each side and 3 px taller each way, as
// `drawPlateText` draws it, so a label can be placed before it is drawn. A
// label in two lines has them this far apart, as `drawPlateLines` sets them.
const LABEL_SIZE = 12;
const LABEL_LINE = LABEL_SIZE + 3;
const PLATE_PAD_X = 4;
const PLATE_PAD_Y = 3;

// The palette is the charts' one palette (`subscribeChartPalette`), read on
// mount and on a theme change, never inside a draw: a settle draws every frame.
// Canvas text does not inherit CSS, so labels are set in its `sans`, the app's
// own token (DESIGN.md §3).
type Palette = ChartPalette;

/** The height of a label's text in `lines` lines. */
function textBlock(lines: number): number {
  return LABEL_SIZE + (lines - 1) * LABEL_LINE;
}

/** The plate a label of `width`, in `lines` lines, centred on (x, y) takes. */
function plateBox(x: number, y: number, width: number, lines = 1): PlateBox {
  return {
    left: x - width / 2 - PLATE_PAD_X,
    right: x + width / 2 + PLATE_PAD_X,
    top: y - textBlock(lines) / 2 - PLATE_PAD_Y,
    bottom: y + textBlock(lines) / 2 + PLATE_PAD_Y,
  };
}

function boxesOverlap(a: PlateBox, b: PlateBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** A placed label hidden under its own plate, edge to edge. */
function coverLabel(ctx: CanvasRenderingContext2D, box: PlateBox, surface: string) {
  ctx.beginPath();
  ctx.roundRect(box.left, box.top, box.right - box.left, box.bottom - box.top, 4);
  ctx.fillStyle = surface;
  ctx.fill();
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

/** Where a line leaving `node` toward (`x`, `y`) passes `gap` px outside its rim. */
function pointOnRim(node: SimNode, x: number, y: number, gap = 0): { x: number; y: number } {
  const dx = x - node.x;
  const dy = y - node.y;
  const distance = Math.hypot(dx, dy) || 1;
  const reach = node.radius + gap;
  return { x: node.x + (dx / distance) * reach, y: node.y + (dy / distance) * reach };
}

/** Would this plate land on some *other* node's disc? */
function overlapsNode(box: PlateBox, nodes: SimNode[], ownId: number): boolean {
  return nodes.some((other) => {
    if (other.id === ownId) return false;
    // The nearest point of the box to the disc's centre: a circle and box test,
    // so a label passing beside a disc is not rejected for being level with it.
    const nearestX = Math.max(box.left, Math.min(other.x, box.right));
    const nearestY = Math.max(box.top, Math.min(other.y, box.bottom));
    return Math.hypot(other.x - nearestX, other.y - nearestY) < other.radius + 2;
  });
}

interface EdgePair {
  key: string;
  a: SimNode;
  b: SimNode;
}

interface PlacedLabel {
  id: number;
  /** What it says on one line; in two, both lines joined. */
  text: string;
  lines: string[];
  x: number;
  y: number;
  box: PlateBox;
}

/** Everything a highlight does not change: drawn once per layout, size or theme. */
interface Scene {
  byId: Map<number, SimNode>;
  pairs: EdgePair[];
  labels: Map<number, PlacedLabel>;
  layers: Map<string, HTMLCanvasElement>;
}

function traceEdges(ctx: CanvasRenderingContext2D, pairs: EdgePair[]) {
  ctx.beginPath();
  for (const { a, b } of pairs) {
    // Two discs too close for a line between their gaps: nothing to draw.
    if (Math.hypot(b.x - a.x, b.y - a.y) <= a.radius + b.radius + EDGE_GAP * 2 + 1) continue;
    const start = pointOnRim(a, b.x, b.y, EDGE_GAP);
    const end = pointOnRim(b, a.x, a.y, EDGE_GAP);
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
  }
}

function strokeEdges(ctx: CanvasRenderingContext2D, pairs: EdgePair[], color: string) {
  if (!pairs.length) return;
  traceEdges(ctx, pairs);
  ctx.lineWidth = CHART.line;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function traceDiscs(ctx: CanvasRenderingContext2D, nodes: SimNode[], inset = 0) {
  ctx.beginPath();
  for (const node of nodes) {
    ctx.moveTo(node.x + node.radius - inset, node.y);
    ctx.arc(node.x, node.y, node.radius - inset, 0, Math.PI * 2);
  }
}

type DiscTone = "rest" | "recede" | "focus";

/** Discs, one fill per kind: the dither for a mass, a ring for a dropped topic. */
function paintDiscs(
  ctx: CanvasRenderingContext2D,
  nodes: SimNode[],
  tone: DiscTone,
  palette: Palette,
  surface: string
) {
  if (!nodes.length) return;
  if (tone === "focus") {
    traceDiscs(ctx, nodes);
    ctx.fillStyle = palette.honey;
    ctx.fill();
    return;
  }
  const color = tone === "rest" ? palette.quiet : palette.rule;
  const byDensity = new Map<number, SimNode[]>();
  const rings: SimNode[] = [];
  const now: SimNode[] = [];
  for (const node of nodes) {
    if (node.state === "dropped") rings.push(node);
    else if (node.state === "live") now.push(node);
    else {
      const density = DENSITY[node.state] ?? DENSITY.open;
      const group = byDensity.get(density);
      if (group) group.push(node);
      else byDensity.set(density, [node]);
    }
  }
  for (const [density, group] of byDensity) {
    ditherFill(ctx, (target) => traceDiscs(target, group), color, density);
  }
  if (rings.length) {
    traceDiscs(ctx, rings, 0.75);
    ctx.fillStyle = surface;
    ctx.fill();
    ctx.lineWidth = CHART.line;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  if (now.length) {
    traceDiscs(ctx, now);
    ctx.fillStyle = palette.honey;
    ctx.fill();
  }
}

function paintLabels(
  ctx: CanvasRenderingContext2D,
  labels: Iterable<PlacedLabel>,
  color: string,
  palette: Palette,
  surface: string
) {
  // The plate is the colour of what the canvas sits on: a card on the board,
  // the page in a conversation's Connections tab.
  const plated = surface === palette.card ? palette : { ...palette, card: surface };
  for (const label of labels) {
    if (label.lines.length > 1) {
      drawPlateLines(ctx, label.lines, label.x, label.y, plated, {
        align: "center",
        color,
        size: LABEL_SIZE,
        lineHeight: LABEL_LINE,
      });
      continue;
    }
    drawPlateText(ctx, label.text, label.x, label.y, plated, {
      align: "center",
      color,
      size: LABEL_SIZE,
    });
  }
}

/** The widest a label may run before its ellipsis. */
function labelWidth(canvasWidth: number): number {
  return Math.min(180, Math.max(96, canvasWidth / 5));
}

/**
 * The widest a line of a label in two lines may run: a little wider than one
 * line may, so the six words a topic name runs to (48 characters at most,
 * `topicNaming.mjs`) fit in two lines of the reading column's graph.
 */
function wrappedLabelWidth(canvasWidth: number): number {
  return Math.min(200, Math.max(120, canvasWidth / 4));
}

/**
 * Where a node's label goes: under its disc by preference, above if that is
 * where the room is, always held inside the canvas so it is never cut at the
 * card's edge. Returns the candidates, best first; a candidate that would
 * leave the canvas is left out.
 *
 * With `wrap` (a conversation's topics), a name longer than a label's width
 * takes two lines before it is ever cut (`balancedLines`), and a label may sit
 * beside its disc too, where a crowded graph often has room left. Without it
 * (the board's conversation titles) a label is one line, cut to fit, as it
 * always was.
 */
function labelCandidates(
  ctx: CanvasRenderingContext2D,
  node: SimNode,
  width: number,
  height: number,
  wrap = false
): PlacedLabel[] {
  const max = labelWidth(width);
  const cut = fitText(ctx, node.label, max);
  // What the label can say, best first: the whole name; then, only for a name
  // that two lines hold and one does not, the same name cut to one line.
  const sayings =
    wrap && cut !== node.label
      ? [balancedLines(ctx, node.label, wrappedLabelWidth(width)), [cut]]
      : [[cut]];
  const out: PlacedLabel[] = [];
  for (const lines of sayings) {
    const text = lines.join(" ");
    const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const half = textWidth / 2 + PLATE_PAD_X + 2;
    const x = Math.min(width - half, Math.max(half, node.x));
    const offset = node.radius + LABEL_GAP + textBlock(lines.length) / 2 + PLATE_PAD_Y;
    for (const y of [node.y + offset, node.y - offset]) {
      const box = plateBox(x, y, textWidth, lines.length);
      if (box.top < 1 || box.bottom > height - 1) continue;
      out.push({ id: node.id, text, lines, x, y, box });
    }
    if (!wrap) continue;
    const reach = node.radius + LABEL_GAP + PLATE_PAD_X + textWidth / 2;
    // Beside the disc, right then left.
    for (const beside of [node.x + reach, node.x - reach]) {
      const box = plateBox(beside, node.y, textWidth, lines.length);
      if (box.left < 1 || box.right > width - 1 || box.top < 1 || box.bottom > height - 1) {
        continue;
      }
      out.push({ id: node.id, text, lines, x: beside, y: node.y, box });
    }
  }
  if (!out.length) {
    // A disc hard against the top or bottom: the label sits inside the canvas
    // beside it rather than off the edge.
    const textWidth = ctx.measureText(cut).width;
    const half = textWidth / 2 + PLATE_PAD_X + 2;
    const x = Math.min(width - half, Math.max(half, node.x));
    const offset = node.radius + LABEL_GAP + LABEL_SIZE / 2 + PLATE_PAD_Y;
    const y = Math.min(height - LABEL_SIZE, Math.max(LABEL_SIZE, node.y + offset));
    out.push({ id: node.id, text: cut, lines: [cut], x, y, box: plateBox(x, y, textWidth) });
  }
  return out;
}

/**
 * Every label that fits, biggest disc first, so when two compete for the same
 * strip of canvas the more important conversation is named. A label that would
 * land on another label or on another disc is left out: worse than no label at
 * all. Whatever is pointed at is named anyway, on top (`forcedLabel`).
 */
function placeLabels(
  ctx: CanvasRenderingContext2D,
  nodes: SimNode[],
  width: number,
  height: number,
  palette: Palette,
  wrap: boolean
): Map<number, PlacedLabel> {
  ctx.font = `400 ${LABEL_SIZE}px ${palette.sans}`;
  const placed = new Map<number, PlacedLabel>();
  const claimed: PlateBox[] = [];
  const byImportance = [...nodes].sort((a, b) => b.radius - a.radius || a.id - b.id);
  for (const node of byImportance) {
    for (const candidate of labelCandidates(ctx, node, width, height, wrap)) {
      if (overlapsNode(candidate.box, nodes, node.id)) continue;
      if (claimed.some((box) => boxesOverlap(candidate.box, box))) continue;
      placed.set(node.id, candidate);
      claimed.push(candidate.box);
      break;
    }
  }
  return placed;
}

export default function ForceGraph<TNode extends GraphNode>({
  nodes: inputNodes,
  edges,
  onSelect,
  selectedId = null,
  layoutKey = null,
  nodeDescription,
  className,
  highlight,
  onHoverChange,
  onActivate,
  onBackgroundPress,
  surface = "background",
  roving = false,
  wrapLabels = false,
  "aria-label": ariaLabel,
}: {
  nodes: TNode[];
  edges: GraphEdge[];
  /** The topic graph's selection: called on press, and with null on empty canvas. */
  onSelect?: (node: TNode | null) => void;
  selectedId?: number | null;
  layoutKey?: string | null;
  nodeDescription?: (node: TNode) => string;
  className?: string;
  /** What to light, from outside: the board's shared highlight. */
  highlight?: HighlightSource;
  /** The pointer or the keyboard reached a node, or left it (`id` null). */
  onHoverChange?: (id: number | null, previous: number | null) => void;
  /** A click that did not drag, or Enter on a node's button. */
  onActivate?: (node: TNode) => void;
  /** A press on the canvas between nodes. */
  onBackgroundPress?: () => void;
  /** The colour behind the canvas, which every label's plate is filled with. */
  surface?: "background" | "card";
  /** One tab stop for the whole graph, with the arrow keys between nodes. */
  roving?: boolean;
  /** A label too long for one line takes two, and may sit beside its disc. */
  wrapLabels?: boolean;
  "aria-label"?: string;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  // Grab offset and pin, as one value whose transitions live in `graphPhysics`.
  // The pin deliberately outlives the pointer; that rule is `releaseDrag`.
  const dragRef = useRef<DragLifecycle>(NOT_DRAGGING);
  // A press, until it has moved far enough to be a drag rather than a click.
  const pressRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // What this graph's own pointer or keyboard is on. Kept out of React state:
  // pointing redraws the canvas and re-renders nothing.
  const hoverRef = useRef<number | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;
  const settleRef = useRef<{ raf: number; alpha: number; last: number } | null>(null);
  // Mirrors node positions into React state purely so the accessible overlay
  // buttons can be positioned; the canvas itself never renders from this.
  const [placed, setPlaced] = useState<SimNode[]>([]);
  // The node that holds the graph's one tab stop, when `roving`.
  const [current, setCurrent] = useState<number | null>(null);
  const buttonRefs = useRef(new Map<number, HTMLButtonElement>());

  const maxDuration = useMemo(
    () => Math.max(...inputNodes.map((node) => node.durationMs), 1),
    [inputNodes]
  );

  // Read once on mount, then only when the theme actually changes.
  const [palette, setPalette] = useState<Palette | null>(null);
  useEffect(
    () => subscribeChartPalette(canvasRef.current ?? document.documentElement, setPalette),
    []
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
      // Seeded in an ellipse the shape of the canvas, so a wide card starts the
      // solve wide rather than round, and the graph uses its width.
      const offset = 0.3 * Math.sqrt(index / inputNodes.length);
      const stored = saved?.[node.id];
      return {
        ...node,
        radius: radiusFor(node, maxDuration),
        x: stored ? stored.x * size.width : size.width / 2 + Math.cos(angle) * offset * size.width,
        y: stored
          ? stored.y * size.height
          : size.height / 2 + Math.sin(angle) * offset * size.height,
        vx: 0,
        vy: 0,
      };
    });
    if (!saved) layout(nodesRef.current, edges, size.width, size.height);
    fitToCanvas(nodesRef.current, size.width, size.height);
    sceneRef.current = null;
    setPlaced(nodesRef.current.map((node) => ({ ...node })));
  }, [inputNodes, edges, size, maxDuration, layoutKey]);

  /** The highlight to draw: the board's, or this graph's own pointer and selection. */
  const currentHighlight = useCallback((): Highlight => {
    const source = highlightRef.current;
    if (source) return source.get();
    const focus = new Set<number>();
    if (hoverRef.current !== null) focus.add(hoverRef.current);
    if (selectedRef.current !== null && selectedRef.current !== undefined) {
      focus.add(selectedRef.current);
    }
    return focus.size ? { ...NO_HIGHLIGHT, focus } : NO_HIGHLIGHT;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !palette || !size.width || !size.height) return;

    // Clamped to 2: a 3x display turns a full-width graph into ~9x the fragments
    // for no visible gain on a 14 px disc. Assigning `width`/`height`
    // reallocates and clears the backing store, so only on a real change.
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(size.width * ratio);
    const pixelHeight = Math.round(size.height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      sceneRef.current = null;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.lineCap = "round";

    const nodes = nodesRef.current;
    const plate = surface === "card" ? palette.card : palette.background;

    let scene = sceneRef.current;
    if (!scene) {
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const pairs: EdgePair[] = [];
      for (const edge of edges) {
        const a = byId.get(edge.from);
        const b = byId.get(edge.to);
        if (a && b && a !== b) pairs.push({ key: edgeKey(edge.from, edge.to), a, b });
      }
      scene = {
        byId,
        pairs,
        labels: placeLabels(ctx, nodes, size.width, size.height, palette, wrapLabels),
        layers: new Map(),
      };
      sceneRef.current = scene;
    }

    const current = currentHighlight();
    const focusNodes = nodes.filter((node) => markTone(current, node.id) === "focus");

    // A layer is a picture of the graph in one tone, cached until the layout,
    // the size or the theme changes. Pointing at something composites layers
    // and draws only what it lights, so it costs a few draws, not the graph.
    // While a settle moves every node each frame, there is nothing to cache.
    const moving = settleRef.current !== null || dragRef.current.grab !== null;
    const layer = (name: string, paint: (target: CanvasRenderingContext2D) => void) => {
      if (moving) {
        paint(ctx);
        return;
      }
      let image = scene.layers.get(name);
      if (!image) {
        image = document.createElement("canvas");
        image.width = canvas.width;
        image.height = canvas.height;
        const target = image.getContext("2d");
        if (target) {
          target.setTransform(ratio, 0, 0, ratio, 0, 0);
          target.lineCap = "round";
          paint(target);
        }
        scene.layers.set(name, image);
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(image, 0, 0);
      ctx.restore();
    };

    if (!current.active) {
      layer("rest", (target) => {
        strokeEdges(target, scene.pairs, palette.quiet);
        paintDiscs(target, nodes, "rest", palette, plate);
        paintLabels(target, scene.labels.values(), palette.quiet, palette, plate);
      });
    } else {
      // What recedes goes behind what is lit, and every name goes over both:
      // a lit edge runs unbroken across a receded disc, which a dash would
      // otherwise make of it, and under every plate, so it crosses no word.
      // Each layer holds everything in its receded tone, so it is the same
      // whatever is pointed at; a lit edge is drawn over its own receded stroke.
      layer("recede-edges", (target) => {
        strokeEdges(target, scene.pairs, palette.rule);
        paintDiscs(target, nodes, "recede", palette, plate);
      });
      strokeEdges(
        ctx,
        scene.pairs.filter((pair) => lineTone(current, pair.key) === "lit"),
        palette.ink
      );
      layer("recede-labels", (target) => {
        paintLabels(target, scene.labels.values(), palette.quiet, palette, plate);
      });
      paintDiscs(
        ctx,
        nodes.filter((node) => markTone(current, node.id) === "rest"),
        "rest",
        palette,
        plate
      );
    }

    paintDiscs(ctx, focusNodes, "focus", palette, plate);
    // Whatever is pointed at or chosen is named, last and therefore on top,
    // even where the layout found no room for its label. A label it lands on
    // is covered whole rather than in part: a fragment of a word is worse than
    // no word, and the hidden one comes back when the pointer moves on.
    ctx.font = `400 ${LABEL_SIZE}px ${palette.sans}`;
    const named = focusNodes.map(
      (node) =>
        scene.labels.get(node.id) ??
        labelCandidates(ctx, node, size.width, size.height, wrapLabels)[0]
    );
    for (const label of named) {
      if (scene.labels.get(label.id) === label) continue;
      for (const other of scene.labels.values()) {
        if (other.id === label.id || !boxesOverlap(label.box, other.box)) continue;
        coverLabel(ctx, other.box, plate);
      }
    }
    paintLabels(ctx, named, palette.ink, palette, plate);
  }, [edges, size, palette, surface, currentHighlight, wrapLabels]);

  // The running settle captured `draw` once, so a hover during a settle had its
  // highlight painted by React and immediately overwritten by the next tick's
  // stale copy. The loop reads the current one through a ref instead.
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw, placed, selectedId]);

  // The board's highlight redraws the canvas directly: no React render.
  useEffect(() => {
    if (!highlight) return undefined;
    drawRef.current();
    return highlight.subscribe(() => drawRef.current());
  }, [highlight]);

  const setHover = useCallback(
    (id: number | null) => {
      const previous = hoverRef.current;
      if (previous === id) return;
      hoverRef.current = id;
      const canvas = canvasRef.current;
      if (canvas && !dragRef.current.grab) {
        canvas.style.cursor = id !== null && (onActivate || onSelect) ? "pointer" : "";
      }
      onHoverChange?.(id, previous);
      // The board redraws from its own store; a graph on its own redraws here.
      if (!highlightRef.current) drawRef.current();
    },
    [onActivate, onSelect, onHoverChange]
  );

  // Wake-and-settle.
  //
  // The simulation is otherwise a one-shot solve, which left dragging feeling
  // dead: the held node moved and every neighbour stayed frozen. This runs the
  // same `simulationStep` as the initial solve, reheated to DRAG_ALPHA and
  // decaying to ALPHA_MIN, and then it **stops**: no permanent jitter, and
  // nothing running behind an idle window.
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
      sceneRef.current = null;

      // Reduced motion gets the *destination*, not the absence of the
      // behaviour: the same steps run synchronously so neighbours still give
      // way, only the journey is skipped.
      //
      // `onRest` is what distinguishes a drag *move* from a drag *end*. Solving
      // on every move would run up to 300 ticks per pointer event.
      if (reducedMotion()) {
        if (!onRest) {
          drawRef.current();
          return;
        }
        settleToRest(nodesRef.current, edges, size.width, size.height, dragRef.current.pinned);
        sceneRef.current = null;
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
          sceneRef.current = null;
          drawRef.current();
          const rest = onRestRef.current;
          onRestRef.current = null;
          rest?.();
          return;
        }

        // Rebuilt every tick: the layout effect replaces nodesRef.current
        // whenever the inputs or the canvas size change, and a map captured once
        // would leave the spring forces acting on detached former nodes.
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
        sceneRef.current = null;
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

  /** The disc under a point: the nearest one within reach, small discs included. */
  const nodeAt = useCallback((x: number, y: number) => {
    let best: SimNode | null = null;
    let bestDistance = Infinity;
    for (const node of nodesRef.current) {
      const distance = Math.hypot(node.x - x, node.y - y);
      if (distance <= node.radius + HIT_SLOP && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }, []);

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const { x, y } = pointAt(event);
      const node = nodeAt(x, y);
      // The topic graph selects on press; the board opens on a click instead.
      if (!onActivate) onSelect?.((node as unknown as TNode) ?? null);
      if (!node) {
        onBackgroundPress?.();
        return;
      }
      pressRef.current = { id: node.id, x, y, moved: false };
      dragRef.current = beginDrag(node.id, node.x - x, node.y - y);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [nodeAt, onSelect, onActivate, onBackgroundPress]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const { x, y } = pointAt(event);
      const drag = dragRef.current.grab;
      if (!drag) {
        setHover(nodeAt(x, y)?.id ?? null);
        return;
      }
      const press = pressRef.current;
      if (press && !press.moved) {
        if (Math.hypot(x - press.x, y - press.y) < DRAG_SLOP) return;
        press.moved = true;
        event.currentTarget.style.cursor = "grabbing";
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
    [nodeAt, size, settle, setHover]
  );

  const endDrag = useCallback(() => {
    if (!dragRef.current.grab) return;
    dragRef.current = releaseDrag(dragRef.current);
    // The node stays pinned *through* the release settle, and is only unpinned
    // once everything has come to rest.
    //
    // Releasing it at let-go was the rubber-banding: during the drag its
    // neighbours are pushed away, and the instant it stopped being pinned all of
    // that stored repulsion pushed straight back into it. Keeping it pinned
    // means the drop point is final and only the neighbours give way.
    settle(() => {
      dragRef.current = restDrag();
      saveLayout(layoutKey, nodesRef.current, size.width, size.height);
      setPlaced(nodesRef.current.map((node) => ({ ...node })));
    });
  }, [layoutKey, size, settle]);

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const press = pressRef.current;
      pressRef.current = null;
      event.currentTarget.style.cursor = hoverRef.current !== null ? "pointer" : "";
      if (press && !press.moved) {
        // A press that never became a drag is a click: nothing moves, nothing
        // settles, and nothing is saved.
        dragRef.current = restDrag();
        const node = nodesRef.current.find((candidate) => candidate.id === press.id);
        if (node) onActivate?.(node as unknown as TNode);
        return;
      }
      endDrag();
    },
    [endDrag, onActivate]
  );

  const ordered = placed;
  const tabStop = roving ? (current ?? ordered[0]?.id ?? null) : null;
  const moveFocus = (step: number | "first" | "last") => {
    if (!ordered.length) return;
    const index = ordered.findIndex((node) => node.id === tabStop);
    const next =
      step === "first"
        ? 0
        : step === "last"
          ? ordered.length - 1
          : (Math.max(0, index) + step + ordered.length) % ordered.length;
    const id = ordered[next].id;
    setCurrent(id);
    buttonRefs.current.get(id)?.focus();
  };

  return (
    <div ref={containerRef} className={cn("relative h-full w-full", className)}>
      <canvas
        ref={canvasRef}
        style={{ width: size.width, height: size.height }}
        className="touch-none"
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          if (!dragRef.current.grab) setHover(null);
        }}
      />
      {/* The canvas cannot hold focusable children, so each node also gets a
          transparent button over it. This is the keyboard and screen-reader path
          into the graph, not a decorative duplicate. */}
      <ul
        aria-label={ariaLabel}
        className="pointer-events-none absolute inset-0 m-0 list-none p-0"
        onKeyDown={(event) => {
          if (!roving) return;
          const step =
            event.key === "ArrowRight" || event.key === "ArrowDown"
              ? 1
              : event.key === "ArrowLeft" || event.key === "ArrowUp"
                ? -1
                : event.key === "Home"
                  ? "first"
                  : event.key === "End"
                    ? "last"
                    : null;
          if (step === null) return;
          event.preventDefault();
          moveFocus(step);
        }}
      >
        {ordered.map((node) => (
          <li key={node.id}>
            <button
              ref={(element) => {
                if (element) buttonRefs.current.set(node.id, element);
                else buttonRefs.current.delete(node.id);
              }}
              type="button"
              tabIndex={roving ? (node.id === tabStop ? 0 : -1) : undefined}
              onClick={() => {
                if (onActivate) onActivate(node as unknown as TNode);
                else onSelect?.(node as unknown as TNode);
              }}
              onFocus={() => {
                if (roving) setCurrent(node.id);
                setHover(node.id);
              }}
              onBlur={() => setHover(null)}
              aria-pressed={onActivate ? undefined : selectedId === node.id}
              // Deliberately NOT pointer-events-auto. These buttons sit exactly
              // over their node discs, so accepting pointer events made them
              // swallow every press before it reached the canvas, and dragging a
              // node was impossible with a mouse. This layer exists so the graph
              // is reachable by keyboard and legible to a screen reader, and it
              // still receives focus, Enter/Space, and its focus ring.
              className="pointer-events-none absolute rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                left: node.x - node.radius - 3,
                top: node.y - node.radius - 3,
                width: node.radius * 2 + 6,
                height: node.radius * 2 + 6,
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
