import { useEffect, useMemo, useRef } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { buildField, HORIZON, SUN_X } from "../../helpers/fieldScene.mjs";

// The oat field, behind everything, in field mode only.
//
// A rebuild, not a restoration. The retired field was a WebGL renderer with a
// 2D-canvas fallback, and it held vsync open repainting an unchanging picture:
// 113% of a core at idle, which is what got it deleted. Nothing here runs a
// frame loop. The stalks are SVG paths with transform-only CSS sway, the chaff
// is four motes on long drifts, and the whole layer is `animation-play-state:
// paused` the moment the window is hidden.
//
// The depth vocabulary is kept from that renderer, because it was right:
//
//   1. Position   — far bands root just under the horizon, the near band roots
//                   below the viewport, so you stand *in* the field.
//   2. Parallax   — near bands lean several times further than far ones. This
//                   is the strongest cue; a still frame reads far flatter. The
//                   *band* is what moves, not the blade: see index.css, where
//                   animating 39 blades measured 131.8% of a core.
//   3. Aerial     — far blades are lower contrast and closer to the haze.
//   4. Draw order — far to near, so near blades occlude far ones.

const CHAFF = [
  { left: "12%", delay: "0s", duration: "34s", drift: "18vw" },
  { left: "38%", delay: "-11s", duration: "41s", drift: "-12vw" },
  { left: "64%", delay: "-24s", duration: "37s", drift: "22vw" },
  { left: "83%", delay: "-6s", duration: "45s", drift: "-16vw" },
];

export default function FieldBackdrop() {
  const mode = useSettingsStore((s) => s.uiMode);
  const layer = useRef<HTMLDivElement | null>(null);

  // Paused rather than unmounted when the window is hidden: unmounting would
  // regrow the whole field on every alt-tab, which is both a flash and more
  // work than leaving it standing still.
  useEffect(() => {
    if (mode !== "field") return undefined;
    const sync = () => {
      layer.current?.toggleAttribute("data-paused", document.hidden);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [mode]);

  // Deterministic: the same field every launch, so it is a place rather than a
  // new random picture each time you open the app.
  // A gust when something happens, and stillness otherwise — see index.css for
  // the measurement that makes this the only affordable shape. Entering the
  // field is itself an event, so the wind greets you.
  const recording = useMeetingRecordingStore((s) => s.isRecording);
  useEffect(() => {
    if (mode !== "field") return undefined;
    const element = layer.current;
    if (!element) return undefined;
    element.toggleAttribute("data-gust", true);
    const timer = window.setTimeout(() => element.toggleAttribute("data-gust", false), 2800);
    return () => window.clearTimeout(timer);
  }, [mode, recording]);

  const bands = useMemo(() => buildField(), []);

  if (mode !== "field") return null;

  return (
    <div ref={layer} className="oats-field-layer" aria-hidden="true">
      <div className="oats-field-sky" style={{ ["--sun-x" as string]: `${SUN_X * 100}%` }} />
      <div className="oats-field-sun" />
      <div className="oats-field-earth" style={{ top: `${HORIZON * 100}%` }} />
      <div className="oats-field-haze" style={{ top: `${HORIZON * 100}%` }} />

      {bands.map((band) => (
        <div
          key={band.depth}
          className="oats-field-band"
          style={{
            top: `${band.rootTop * 100}%`,
            opacity: band.opacity,
            ["--sway-px" as string]: `${band.sway * 3.4}px`,
            ["--sway-time" as string]: `${band.swayMs}ms`,
          }}
        >
          {band.blades.map((blade) => (
            <svg
              key={blade.id}
              viewBox="0 0 20 100"
              // Its own size, not the band's: stretching a shared viewBox to
              // the full width scaled x by ~24 and turned every stalk into a
              // slab with a lily pad on top.
              width={blade.width}
              height={blade.height}
              style={{ left: `${blade.x}%`, marginLeft: -blade.width / 2 }}
            >
              <path
                d={blade.stem}
                stroke="currentColor"
                strokeWidth={2.4}
                fill="none"
                strokeLinecap="round"
              />
              {blade.ears.map((ear, i) => (
                <ellipse
                  key={i}
                  cx={ear.cx}
                  cy={ear.cy}
                  rx={2.6}
                  ry={4.6}
                  fill="currentColor"
                  transform={`rotate(${ear.rot} ${ear.cx} ${ear.cy})`}
                />
              ))}
            </svg>
          ))}
        </div>
      ))}

      {CHAFF.map((mote, i) => (
        <span
          key={i}
          className="oats-field-chaff"
          style={{
            left: mote.left,
            animationDelay: mote.delay,
            animationDuration: mote.duration,
            ["--drift" as string]: mote.drift,
          }}
        />
      ))}
    </div>
  );
}
