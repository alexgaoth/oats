import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../lib/utils";
import { GRID, defaultLayout, fitToBoard, layoutBottom, placeWidget } from "./boardLayout";
import type { BoardWidget } from "./boardLayout";

// The board: a canvas with a dot every 24 px, and the widgets on it as cards
// that snap to those dots. A card moves by its header and resizes by its
// bottom-right corner; the cards it would land on step down out of its way,
// and it is saved where it was let go.
//
// Calm by construction: nothing on it moves at rest, the cards pushed aside
// glide 150 ms to their place (not under reduced motion), and the dots are one
// pixel in the rule grey.

/** A card's header, which is also the handle it is moved by. */
export const HEADER = 36;

// The dots: a one-pixel square at every grid corner, in the rule grey, drawn by
// masking a fill of the token so the colour follows the theme. A mask, not a
// radial gradient: a gradient with a sub-pixel radius quantizes to all or
// nothing (CLAUDE.md, the contour's rule 7).
const DOT =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Crect width='1' height='1'/%3E%3C/svg%3E\")";
const DOTS_STYLE: React.CSSProperties = {
  backgroundColor: "var(--color-border)",
  WebkitMaskImage: DOT,
  maskImage: DOT,
  WebkitMaskSize: `${GRID}px ${GRID}px`,
  maskSize: `${GRID}px ${GRID}px`,
};

interface Gesture {
  id: string;
  kind: "move" | "resize";
  pointerId: number;
  x: number;
  y: number;
  /** The layout as it was when the gesture began: every step starts from it. */
  base: BoardWidget[];
  origin: BoardWidget;
  preview: BoardWidget[];
}

/** The nearest ancestor that scrolls vertically: the page the board sits on. */
function scrollingAncestor(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) node = node.parentElement;
  return node;
}

export default function Board({
  widgets: saved,
  onCommit,
  name,
  render,
  empty,
  "aria-label": ariaLabel,
}: {
  /** The tab's saved layout, or null for the default. */
  widgets: BoardWidget[] | null;
  /** A new arrangement to keep: a card moved, resized or removed. */
  onCommit: (widgets: BoardWidget[]) => void;
  name: (widget: BoardWidget) => string;
  render: (widget: BoardWidget, size: { width: number; height: number }) => ReactNode;
  /** Shown in the middle of a board somebody has cleared of every card. */
  empty?: ReactNode;
  "aria-label"?: string;
}) {
  const { t } = useTranslation();
  const area = useRef<HTMLDivElement | null>(null);
  const [room, setRoom] = useState({ cols: 0, rows: 0, inset: GRID });

  // The board is as wide as the page and at least as tall as the window
  // leaves it, so the dots reach every edge and the default layout fills the
  // view. Measured, never estimated, and only when the window or the page
  // changes size.
  //
  // The grid is centred, so the board keeps the same margin either side, and
  // that margin is published as `--board-inset` on the page for the rows above
  // the board to line up with its cards at both ends.
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return undefined;
    const scroller = scrollingAncestor(element);
    const measure = () => {
      const width = element.clientWidth;
      const top =
        element.getBoundingClientRect().top -
        (scroller?.getBoundingClientRect().top ?? 0) +
        (scroller?.scrollTop ?? 0);
      const height = (scroller?.clientHeight ?? window.innerHeight) - top;
      const cols = Math.max(1, Math.floor((width - GRID * 2) / GRID));
      const next = {
        cols,
        rows: Math.max(1, Math.floor((height - GRID * 2) / GRID)),
        inset: Math.max(GRID, Math.floor((width - cols * GRID) / 2)),
      };
      scroller?.style.setProperty("--board-inset", `${next.inset}px`);
      setRoom((previous) =>
        previous.cols === next.cols && previous.rows === next.rows && previous.inset === next.inset
          ? previous
          : next
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (scroller) observer.observe(scroller);
    return () => {
      observer.disconnect();
      scroller?.style.removeProperty("--board-inset");
    };
  }, []);

  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  gestureRef.current = gesture;

  const committed = useMemo(
    () =>
      room.cols
        ? fitToBoard(saved ?? defaultLayout(room.cols, room.rows), room.cols)
        : ([] as BoardWidget[]),
    [saved, room]
  );
  const shown = gesture?.preview ?? committed;
  const rows = Math.max(room.rows, layoutBottom(shown));

  const begin = useCallback(
    (event: React.PointerEvent<HTMLElement>, widget: BoardWidget, kind: Gesture["kind"]) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setGesture({
        id: widget.id,
        kind,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        base: committed,
        origin: widget,
        preview: committed,
      });
    },
    [committed]
  );

  const track = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const current = gestureRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const dx = Math.round((event.clientX - current.x) / GRID);
      const dy = Math.round((event.clientY - current.y) / GRID);
      const { origin } = current;
      const candidate =
        current.kind === "move"
          ? { ...origin, x: origin.x + dx, y: origin.y + dy }
          : { ...origin, w: origin.w + dx, h: origin.h + dy };
      const preview = placeWidget(current.base, candidate, room.cols);
      setGesture((previous) => (previous ? { ...previous, preview } : previous));
    },
    [room.cols]
  );

  const finish = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const current = gestureRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      setGesture(null);
      const moved = current.preview.some((widget, index) => {
        const before = current.base[index];
        return (
          !before ||
          before.x !== widget.x ||
          before.y !== widget.y ||
          before.w !== widget.w ||
          before.h !== widget.h
        );
      });
      if (moved) onCommit(current.preview);
    },
    [onCommit]
  );

  // Escape puts a card back where it was picked up from.
  useEffect(() => {
    if (!gesture) return undefined;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setGesture(null);
      }
    };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, [gesture]);

  return (
    <div
      ref={area}
      role="region"
      aria-label={ariaLabel}
      className="relative w-full overflow-x-clip"
      style={{ height: (rows + 2) * GRID }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          ...DOTS_STYLE,
          WebkitMaskPosition: `${room.inset % GRID}px 0`,
          maskPosition: `${room.inset % GRID}px 0`,
        }}
      />
      {room.cols > 0 && !shown.length && empty && (
        <div className="absolute inset-x-0 top-1/3 flex justify-center px-6">{empty}</div>
      )}
      <div
        className="absolute"
        style={{ left: room.inset, top: GRID, width: room.cols * GRID, height: rows * GRID }}
      >
        {shown.map((widget) => {
          const held = gesture?.id === widget.id;
          // While a card is resized its content keeps the size it had, and takes
          // the new one when let go: a graph re-solved on every 24 px of a drag
          // would jitter under the hand.
          const settled = committed.find((item) => item.id === widget.id) ?? widget;
          const body = {
            width: settled.w * GRID - 2,
            height: settled.h * GRID - HEADER - 2,
          };
          const label = name(widget);
          return (
            <section
              key={widget.id}
              aria-label={label}
              data-widget={widget.type}
              className={cn(
                "group absolute left-0 top-0 flex flex-col overflow-clip rounded-xl border border-border bg-card shadow-xs",
                held
                  ? "z-10 shadow-sm"
                  : "transition-transform duration-150 ease-out motion-reduce:transition-none"
              )}
              style={{
                transform: `translate(${widget.x * GRID}px, ${widget.y * GRID}px)`,
                width: widget.w * GRID,
                height: widget.h * GRID,
              }}
            >
              <header
                className={cn(
                  "flex shrink-0 touch-none select-none items-center gap-2 pl-3.5 pr-1.5",
                  held && gesture?.kind === "move" ? "cursor-grabbing" : "cursor-grab"
                )}
                style={{ height: HEADER }}
                onPointerDown={(event) => {
                  // The remove button is in the header but is not a handle.
                  if ((event.target as HTMLElement).closest("button")) return;
                  begin(event, widget, "move");
                }}
                onPointerMove={track}
                onPointerUp={finish}
                onPointerCancel={finish}
              >
                <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {label}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("oats.global.widget.remove", { name: label })}
                  onClick={() => onCommit(committed.filter((item) => item.id !== widget.id))}
                  className="text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X aria-hidden="true" />
                </Button>
              </header>
              <div className="relative min-h-0 flex-1 overflow-clip">
                <div className="absolute left-0 top-0" style={body}>
                  {render(widget, body)}
                </div>
              </div>
              {/* The corner a card is resized by. A pointer path; the keyboard
                  resizes with shift and the arrow keys on a focused card. */}
              <div
                aria-hidden="true"
                className="absolute bottom-0 right-0 flex size-4 cursor-nwse-resize touch-none items-end justify-end p-[3px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                onPointerDown={(event) => begin(event, widget, "resize")}
                onPointerMove={track}
                onPointerUp={finish}
                onPointerCancel={finish}
              >
                <svg viewBox="0 0 8 8" className="size-2" aria-hidden="true">
                  <path
                    d="M7 1 1 7M7 4 4 7"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
