import { useCallback, useEffect, useState } from "react";
import { cn } from "../lib/utils";
import FieldCanvas from "./field/FieldCanvas";
import FieldGL from "./field/FieldGL";
import type { FieldScene } from "./field/fieldModel";

// The field (DESIGN.md §9.8) — the world Oats lives in.
//
// This is not a recording decoration. Sky, one low sun, the horizon, and the
// earth under it are drawn **always**, so the app is a place rather than a blank
// page; pressing record grows the wheat out of that ground and stopping lets it
// withdraw. Keeping the world permanent and the wheat conditional preserves
// §9.8's "the one moment Oats is allowed to be beautiful" while giving every
// other surface something to stand on.
//
// This component is only the chooser. The world renders on the GPU where that is
// genuinely available and on a 2D canvas where it is not; both draw the same
// field from the same model (`field/fieldModel.ts`).

/** Probe once per session — creating throwaway contexts is not free. */
let cachedSupport: boolean | null = null;

function supportsGpuField(): boolean {
  if (cachedSupport !== null) return cachedSupport;
  cachedSupport = false;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const gl = canvas.getContext("webgl2", {
      failIfMajorPerformanceCaveat: true,
    }) as WebGL2RenderingContext | null;
    if (!gl) return cachedSupport;

    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(
      debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    ).toLowerCase();

    // Belt and braces: some drivers report no performance caveat and still hand
    // back a software rasteriser, which would be slower than the 2D path.
    const software = /swiftshader|llvmpipe|softpipe|software|microsoft basic/.test(renderer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    cachedSupport = !software;
  } catch {
    cachedSupport = false;
  }
  return cachedSupport;
}

/**
 * Which scenery accompanies recording. Read once per mount: a URL param for
 * harness pages, then localStorage as an override for trying alternatives.
 * The shipped default is `scene` — the full dithered countryside (DESIGN.md
 * §9.9): the sky clears in grain, the irimoya farmhouse condenses on the
 * horizon, birds cross — all in sync with the wheat's own grow/recede.
 */
function readFieldScene(): FieldScene {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("fieldScene");
    const stored = fromUrl ?? window.localStorage.getItem("oats.fieldScene");
    if (stored === "off" || stored === "sky" || stored === "minka" || stored === "scene") {
      return stored;
    }
  } catch {
    // Storage access can throw in hardened contexts; the default is fine.
  }
  return "scene";
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

/**
 * Whether anybody can see the window, as main reports it.
 *
 * The Oats window runs with `backgroundThrottling: false`, which pins
 * `document.visibilityState` to "visible": minimized, closed to the tray or
 * covered, the page is told nothing, and the field drew at the display's full
 * rate for nobody. Main knows (`helpers/windowVisibility.js`), so it pushes each
 * change, and the first value is pulled because a push sent before this
 * listener existed is lost.
 */
function useWindowSeen(): boolean {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    const api = window.electronAPI;
    let pushed = false;
    let disposed = false;
    const unsubscribe = api?.onWindowVisibility?.((visible) => {
      pushed = true;
      setSeen(visible);
    });
    api
      ?.getWindowVisibility?.()
      .then((visible) => {
        // A push that arrived while this was in flight is the newer answer.
        if (!disposed && !pushed && typeof visible === "boolean") setSeen(visible);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);
  return seen;
}

export default function Field({
  live,
  intensity = 1,
  animate = true,
  className,
}: {
  live: boolean;
  /**
   * How present the world is, 0..1. Conversation is the hero surface and gets
   * the full sky; Intelligence and Settings are for reading, and §9.8 is
   * explicit that the field must never compete with a word on screen — at full
   * strength the horizon line draws straight through a paragraph.
   */
  intensity?: number;
  /**
   * Whether the world moves. The reading surfaces get a still frame of it: the
   * wind is a backdrop for a conversation, and a renderer that keeps drawing it
   * behind a page of text is spending a laptop battery on something nobody is
   * looking at.
   */
  animate?: boolean;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  // Nobody to see it, nothing to draw: the wind waits, and resumes where it
  // was. Deliberately no IntersectionObserver: the backdrop is fixed to the
  // window, so it is never scrolled away, and an observer is not free. With
  // the listening pulse breathing, one on this element added ~40ms of main
  // thread a second, measured, field still or not.
  const documentVisible = useDocumentVisible();
  const windowSeen = useWindowSeen();
  const visible = documentVisible && windowSeen;
  const [gpuFailed, setGpuFailed] = useState(false);
  const onFailure = useCallback(() => setGpuFailed(true), []);

  // Probed in a lazy initialiser, not in the render body. `supportsGpuField`
  // creates a canvas and a throwaway WebGL context, which is a side effect —
  // and React 19's StrictMode deliberately double-invokes render to surface
  // exactly that. The module-level cache keeps the second call idempotent.
  const [gpuSupported] = useState(supportsGpuField);
  const [scene] = useState(readFieldScene);
  const useGpu = !gpuFailed && gpuSupported;

  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0", className)}>
      {useGpu ? (
        <FieldGL
          live={live}
          intensity={intensity}
          animate={animate}
          visible={visible}
          scene={scene}
          reduced={reduced}
          onFailure={onFailure}
        />
      ) : (
        <FieldCanvas
          live={live}
          intensity={intensity}
          animate={animate}
          visible={visible}
          scene={scene}
          reduced={reduced}
        />
      )}
    </div>
  );
}
