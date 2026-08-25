import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";

// A sprig of oats sitting on top of a control, in field mode.
//
// Press the control and it hops off, then regrows. That is the whole feature,
// and the rules it keeps are why it is a component rather than three lines of
// CSS:
//
//   * It never intercepts the press. `pointer-events: none` — a decoration that
//     ate clicks on the record button would be the worst bug in the product.
//   * It is `aria-hidden`, and adds nothing to the control's accessible name.
//     A screen reader announcing "wheat" before every button is noise.
//   * It leaves and comes back. Never returning turns a delight into something
//     you can use up; returning instantly makes the hop meaningless.
//
// It finds its own host — the element it is rendered inside — and listens
// there, in the capture phase so a control that stops the event still knocks
// its sprig off. That keeps call sites to `<WheatPerch />` inside anything
// `relative`, with no props to thread and no second source of truth.

const REGROW_MS = 4200;

export default function WheatPerch({ className }: { className?: string }) {
  const fieldMode = useSettingsStore((s) => s.uiMode) === "field";
  const sprig = useRef<HTMLSpanElement | null>(null);
  const [hopping, setHopping] = useState(false);
  // Bumped after each hop so the grow-in animation replays: React would
  // otherwise reuse the node and the sprig would simply blink back.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const host = sprig.current?.parentElement;
    if (!fieldMode || !host) return undefined;
    const knockOff = () => setHopping(true);
    host.addEventListener("pointerdown", knockOff, { capture: true });
    return () => host.removeEventListener("pointerdown", knockOff, { capture: true });
  }, [fieldMode, generation]);

  useEffect(() => {
    if (!hopping) return undefined;
    const timer = window.setTimeout(() => {
      setHopping(false);
      setGeneration((n) => n + 1);
    }, REGROW_MS);
    return () => window.clearTimeout(timer);
  }, [hopping]);

  if (!fieldMode) return null;

  return (
    <span
      key={generation}
      ref={sprig}
      data-hopping={hopping ? "" : undefined}
      aria-hidden="true"
      className={`oats-perch ${className ?? ""}`}
    >
      <svg viewBox="0 0 14 18" className="h-full w-full overflow-visible">
        <path
          d="M 7 18 Q 6 11 7 4"
          stroke="currentColor"
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
        />
        {[0, 1, 2].map((i) => {
          const cx = 7 + (i % 2 === 0 ? -1.6 : 1.6);
          const cy = 4.5 + i * 3.1;
          return (
            <ellipse
              key={i}
              cx={cx}
              cy={cy}
              rx="1.5"
              ry="2.5"
              fill="currentColor"
              opacity={0.9 - i * 0.12}
              transform={`rotate(${i % 2 === 0 ? -22 : 22} ${cx} ${cy})`}
            />
          );
        })}
      </svg>
    </span>
  );
}
