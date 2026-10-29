import { useLayoutEffect, useMemo, useState } from "react";
import Field from "../conversation/Field";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { activeFieldColumn, subscribeFieldColumns } from "./fieldColumns";
import { composeField, fallbackView, type FieldRoom, type FieldView } from "./fieldViews";

// Field mode's backdrop: the world, behind the whole app.
//
// This is the original field (`conversation/field/`), recovered from before its
// retirement — WebGL where the GPU is genuinely available, a 2D canvas where it
// is not, both drawing the same model. It was deleted because Oats cannot wear
// two brands at once; it is back as the *second interface* rather than as the
// product's face, so work mode still renders none of it.
//
// What it draws is composed for the screen in front of it (fieldViews.ts): the
// world keeps clear of the content's column, the horizon and the light are set
// per screen, and the sun stands where there is room for all of it. Moving to
// another screen eases from one picture to the next in the frame's own time.
//
// The field's own props are kept as they were:
//
//   live      — always true here. In the work interface the wheat grew only
//               while recording, because the field was that interface's one
//               moment of beauty; in field mode an empty field most of the time
//               is not a field. Permanently grown wheat was tried once with
//               `animate` still on and cost 128.6 points of a core, because the
//               renderer only comes to rest once the wheat has withdrawn — so
//               the two props are split instead: the field stands, and the wind
//               is what waits for a conversation.
//   animate   — wind only while recording. A still field is a photograph and
//               costs nothing; a moving one is a frame loop, and this app runs
//               with GPU compositing disabled on Linux. The reading screens get
//               a still frame: wind behind a page of text is a laptop battery
//               spent on something nobody is watching. Easing to a new screen's
//               picture draws frames for the length of the move, then stops.

interface Measured {
  room: FieldRoom;
  view: FieldView | null;
}

/**
 * Measure the screen that is showing: the window, its pane, and the box of its
 * content column's blocks. Called from a layout effect and from a
 * ResizeObserver, where layout is already fresh — never from a draw.
 */
function measureRoom(): { measured: Measured; observe: Element[] } {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const active = activeFieldColumn();
  const main =
    active?.element.closest("main") ?? document.querySelector("main[data-active='true']");
  // The pane's box is its parent's: the pane itself rises 8px as it fades in,
  // and the backdrop composes for where it lands.
  const paneBox = (main?.parentElement ?? main)?.getBoundingClientRect();
  const pane = paneBox
    ? {
        left: Math.round(paneBox.left),
        top: Math.round(paneBox.top),
        right: Math.round(paneBox.right),
        bottom: Math.round(paneBox.bottom),
      }
    : { left: 0, top: 0, right: width, bottom: height };
  const rise = main && paneBox ? main.getBoundingClientRect().top - paneBox.top : 0;

  let content: FieldRoom["content"] = null;
  const observe: Element[] = [];
  if (main) observe.push(main);
  if (active) {
    observe.push(active.element);
    let left = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    // The column's blocks, not the column: a column that fills the pane (the
    // recording view's) ends where its last card does.
    for (const child of Array.from(active.element.children)) {
      const box = child.getBoundingClientRect();
      if (box.width <= 2 || box.height <= 2) continue;
      observe.push(child);
      left = Math.min(left, box.left);
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom - rise);
    }
    if (left < right) {
      const scroller = active.element.closest(".oats-surface");
      const scrolls = scroller ? scroller.scrollHeight > scroller.clientHeight + 1 : false;
      content = {
        left: Math.round(left),
        right: Math.round(right),
        bottom: scrolls ? pane.bottom : Math.min(Math.round(bottom), pane.bottom),
      };
    }
  }
  return {
    measured: { room: { width, height, pane, content }, view: active?.view ?? null },
    observe,
  };
}

function sameMeasured(a: Measured | null, b: Measured): boolean {
  if (!a || a.view !== b.view) return false;
  const p = a.room;
  const q = b.room;
  const content =
    p.content === q.content ||
    (p.content !== null &&
      q.content !== null &&
      p.content.left === q.content.left &&
      p.content.right === q.content.right &&
      p.content.bottom === q.content.bottom);
  return (
    p.width === q.width &&
    p.height === q.height &&
    p.pane.left === q.pane.left &&
    p.pane.top === q.pane.top &&
    p.pane.right === q.pane.right &&
    p.pane.bottom === q.pane.bottom &&
    content
  );
}

/**
 * The room the backdrop composes for, kept current: on a change of screen, a
 * column mounting, and any resize of the pane, the column or its blocks. No
 * scroll listener: a column that scrolls is calm from top to bottom anyway.
 */
function useFieldRoom(enabled: boolean, surface: string, recording: boolean): Measured | null {
  const [measured, setMeasured] = useState<Measured | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    let observed: Element[] = [];
    const observer = new ResizeObserver(() => update());
    const update = () => {
      const next = measureRoom();
      setMeasured((previous) => (sameMeasured(previous, next.measured) ? previous : next.measured));
      // The blocks come and go with the content, so the set is renewed each time.
      const same =
        next.observe.length === observed.length &&
        next.observe.every((element, index) => element === observed[index]);
      if (!same) {
        observer.disconnect();
        observed = next.observe;
        for (const element of observed) observer.observe(element);
      }
    };
    const unsubscribe = subscribeFieldColumns(update);
    window.addEventListener("resize", update);
    update();
    // Once more after the panes have crossed: a screen opened for the first
    // time builds its content a render after it becomes the active one.
    const settle = window.setTimeout(update, 320);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("resize", update);
      unsubscribe();
      observer.disconnect();
    };
  }, [enabled, surface, recording]);

  return enabled ? measured : null;
}

export default function FieldBackdrop({ surface }: { surface: string }) {
  const fieldMode = useSettingsStore((s) => s.uiMode) === "field";
  const recording = useMeetingRecordingStore((s) => s.isRecording);
  const measured = useFieldRoom(fieldMode, surface, recording);
  const view = measured?.view ?? fallbackView(surface, recording);
  const composition = useMemo(
    () => (measured ? composeField(view, measured.room) : undefined),
    [view, measured]
  );

  if (!fieldMode) return null;

  return (
    <Field
      live
      composition={composition}
      animate={recording && surface === "conversation"}
      className="fixed inset-0 -z-10"
    />
  );
}
