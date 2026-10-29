import { useEffect, useRef } from "react";
import {
  BANDS,
  BLADE_SEGMENTS,
  CALM_TOP_FEATHER,
  CHAFF_COUNT,
  HORIZON,
  INTRO_MS,
  SCENE_IDS,
  aimPicture,
  bandPlacement,
  bandStyle,
  createField,
  defaultComposition,
  mixRgb,
  parseHexColor,
  pictureAt,
  sceneFrame,
  startPicture,
  type Field,
  type FieldComposition,
  type FieldScene,
  type Rgb,
} from "./fieldModel";
import {
  FRAME_BUDGET_MS,
  FRAME_INTERVAL_MS,
  MOVE_MS,
  createFieldClock,
  easeToward,
  fieldLoopState,
  frameDelay,
  frameDue,
} from "./fieldLoop";
import { backingSize, observeDevicePixels, watchPixelRatio } from "./canvasSize";
import {
  BACKDROP_FRAGMENT,
  BACKDROP_VERTEX,
  CHAFF_FRAGMENT,
  CHAFF_VERTEX,
  FRAGMENT_SHADER,
  VERTEX_SHADER,
} from "./shaders";

// GPU renderer for the oat field (DESIGN.md §9.8).
//
// One canvas, three passes, one shared Bayer dither — which is what keeps the
// product inside §7's "one animated dither layer, ever" while still letting the
// sky, the blades, and the chaff all carry grain:
//
//   1. **Backdrop.** Sky, one low sun, the horizon hairline, and a warm earth
//      wash. A single fullscreen triangle. Dithering this gradient is the
//      strongest brand signal in the app — banding becomes deliberate grain.
//   2. **Blades.** One instanced draw per depth band, far to near, so near
//      blades occlude far ones.
//   3. **Chaff.** A few dozen motes drifting in the light.
//
// The canvas runs whether or not a conversation is recording. Idle draws the
// world — sky, sun, horizon, bare ground — and pressing record *grows* the
// wheat out of it. That keeps §9.8's "the one moment Oats is allowed to be
// beautiful" intact while making the app always feel like a place rather than a
// blank page.
//
// Measured on the Linux target (Intel ARL via ANGLE, under Oats'
// --disable-gpu-compositing): ~0ms blocking cost on the CPU, and readback costs
// about 1.8ms/frame at 2x DPR.
//
// What it costs is how many frames it draws, so it draws as few as the picture
// allows (`fieldLoop.ts`): one frame per change while the world is still, at
// most 30 a second while the wind blows, and none at all while nobody can see
// the window. Measured on an M5 Pro while recording, that took the field from
// 120 frames a second to 30, and from 120 to 0 minimized, in the tray or covered.

/** Blades at full density. Stepped down automatically if frames start slipping. */
const BLADE_COUNT = 3600;

/** Frames sampled before deciding the device is not keeping up (FRAME_BUDGET_MS). */
const SAMPLE_WINDOW = 120;
const MIN_DENSITY = 0.35;

/** How far the pointer's parting closes per 60 Hz frame (see `easeToward`). */
const POINTER_EASE = 0.18;

/** How long the wheat takes to withdraw when a conversation ends. Slower than it
 *  grew: arriving should feel like weather, leaving like settling. */
const RECEDE_MS = 2200;

/** Below this the wheat is gone and the world is at rest — see the loop. */
const AT_REST = 0.0005;

interface Palette {
  bandColors: Rgb[];
  gold: Rgb;
  ink: Rgb;
  /** How hard to push the warm wash. Gold is darker than oat-milk paper and
   *  lighter than steel-cut charcoal, so the same alpha reads very differently
   *  in the two modes. */
  warmScale: number;
}

const FALLBACK_GOLD: Rgb = [198 / 255, 123 / 255, 39 / 255];
const FALLBACK_HAZE: Rgb = [107 / 255, 100 / 255, 89 / 255];
const FALLBACK_INK: Rgb = [43 / 255, 38 / 255, 32 / 255];
const FALLBACK_PAPER: Rgb = [255 / 255, 253 / 255, 248 / 255];

/** Rough relative luminance — enough to tell paper from charcoal. */
function luminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Read the palette from CSS custom properties.
 *
 * Called on mount and on theme change only. Reading it inside the draw loop
 * forces a style recalculation every frame for the length of a conversation.
 */
function readPalette(element: HTMLElement): Palette {
  const styles = getComputedStyle(element);
  const gold = parseHexColor(styles.getPropertyValue("--color-primary")) ?? FALLBACK_GOLD;
  const haze = parseHexColor(styles.getPropertyValue("--color-muted-foreground")) ?? FALLBACK_HAZE;
  const ink = parseHexColor(styles.getPropertyValue("--color-foreground")) ?? FALLBACK_INK;
  const surface =
    parseHexColor(styles.getPropertyValue("--color-surface-raised")) ??
    parseHexColor(styles.getPropertyValue("--color-background")) ??
    FALLBACK_PAPER;

  // On paper, gold darkens; on charcoal it brightens. The wash has to be much
  // gentler in Oat milk or it reads as a coffee stain rather than as light.
  const paperIsLight = luminance(surface) > luminance(ink);
  const warmScale = paperIsLight ? 0.5 : 1;

  return {
    gold,
    ink,
    warmScale,
    bandColors: Array.from({ length: BANDS }, (_, band) =>
      mixRgb(haze, gold, bandStyle(band).goldMix)
    ),
  };
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("could not create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("could not create program");
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`link failed: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

/** A blade is a triangle strip: two vertices per segment boundary. */
function bladeGeometry(): Float32Array {
  const verts: number[] = [];
  for (let i = 0; i <= BLADE_SEGMENTS; i += 1) {
    const t = i / BLADE_SEGMENTS;
    verts.push(-1, t, 1, t);
  }
  return new Float32Array(verts);
}

const STRIDE_FLOATS = 8;
const STRIDE_BYTES = STRIDE_FLOATS * 4;

function instanceData(field: Field): Float32Array {
  const data = new Float32Array(field.blades.length * STRIDE_FLOATS);
  field.blades.forEach((blade, i) => {
    const o = i * STRIDE_FLOATS;
    data[o] = blade.x;
    data[o + 1] = blade.spread;
    data[o + 2] = blade.height;
    data[o + 3] = blade.lean;
    data[o + 4] = blade.phase;
    data[o + 5] = blade.growDelay;
    data[o + 6] = blade.growSpan;
    data[o + 7] = blade.droop;
  });
  return data;
}

/** Motes of chaff: x, y (up from the bottom), size, phase. Deterministic like the field. */
function chaffData(): Float32Array {
  let seed = 981173;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const data = new Float32Array(CHAFF_COUNT * 4);
  for (let i = 0; i < CHAFF_COUNT; i += 1) {
    data[i * 4] = random();
    // Kept to the band around and just above the horizon, where the light is.
    data[i * 4 + 1] = 0.42 + random() * 0.3;
    data[i * 4 + 2] = 0.35 + random() * 0.65;
    data[i * 4 + 3] = random() * 6.283;
  }
  return data;
}

export default function FieldGL({
  live,
  intensity,
  composition,
  animate,
  visible,
  scene,
  sceneHeight,
  reduced,
  onFailure,
}: {
  /** True while a conversation is recording. Drives the wheat, not the world. */
  live: boolean;
  /** How present the world is on this surface, 0..1, when no composition is given. */
  intensity: number;
  /** The picture to draw (fieldModel.ts); a change eases there over MOVE_MS. */
  composition?: FieldComposition;
  /**
   * Whether the world is in motion. False on the reading surfaces, where the
   * field is a still image: the loop draws one settled frame and then stops
   * entirely rather than holding vsync open for a backdrop nobody is watching.
   */
  animate: boolean;
  /**
   * Whether anybody can see the field. While they cannot, a moving field draws
   * nothing and schedules nothing, and its clock stops, so it resumes exactly
   * where it was left rather than a jump further on.
   */
  visible: boolean;
  /** Which scenery accompanies recording (DESIGN.md §9.9). */
  scene: FieldScene;
  /** The scene's own height in CSS px, standing on the canvas's bottom edge;
   *  by default the canvas's height (`sceneFrame` in fieldModel.ts). */
  sceneHeight?: number;
  reduced: boolean;
  onFailure: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  /** 0..1, eased toward the pointer's presence so the parting cannot pop. */
  const pointerFadeRef = useRef(0);
  /** Where the pointer last was, kept while the parting fades out. */
  const pointerLastRef = useRef<{ x: number; y: number } | null>(null);
  const paletteRef = useRef<Palette | null>(null);
  const failedRef = useRef(false);
  const liveRef = useRef(live);
  liveRef.current = live;
  const animateRef = useRef(animate);
  animateRef.current = animate;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const sceneHeightRef = useRef(sceneHeight);
  sceneHeightRef.current = sceneHeight;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  // The picture, and the move toward a new one (`aimPicture` in fieldModel.ts),
  // on the wall clock. Kept outside the GL effect so a context rebuilt
  // mid-move picks up where the old one was.
  const pictureRef = useRef(startPicture(composition ?? defaultComposition(intensity)));

  // Set by the GL effect below. Anything that changes what a settled frame
  // should look like calls it: the loop is not running to notice for itself.
  const wakeRef = useRef<(() => void) | null>(null);

  // `intensity` and `live` are read through refs so they never rebuild the GL
  // context (which would reset the grow/recede state mid-transition), which
  // also means a change to either draws nothing until the loop is woken.
  useEffect(() => {
    wakeRef.current?.();
  }, [animate, live, visible, sceneHeight]);

  // A new picture: moved to over MOVE_MS from wherever the field is now, or
  // drawn as it is when there is nothing to move from, nobody to see the move,
  // or a person who asked for no motion.
  useEffect(() => {
    const move = pictureRef.current;
    const before = move.to;
    aimPicture(
      move,
      composition ?? defaultComposition(intensity),
      performance.now(),
      reducedRef.current || !visibleRef.current
    );
    if (move.to !== before) wakeRef.current?.();
  }, [composition, intensity]);

  useEffect(() => {
    if (reduced) return;
    const onMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const clear = () => {
      pointerRef.current = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", clear);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", clear);
    };
  }, [reduced]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || failedRef.current) return;

    let raf = 0;
    let timer = 0;
    let disposed = false;

    const fail = (reason: string) => {
      if (failedRef.current || disposed) return;
      failedRef.current = true;
      console.warn(`[field] falling back to 2D canvas: ${reason}`);
      onFailure();
    };

    let context: WebGL2RenderingContext | null = null;
    const cleanupFns: Array<() => void> = [];

    try {
      context = canvas.getContext("webgl2", {
        alpha: true,
        antialias: false, // MSAA would smear the ordered dither into mush
        depth: false,
        stencil: false,
        powerPreference: "low-power",
        // Deliberately NOT desynchronized: under Oats' software compositing on
        // Linux that low-latency hint lets partially-presented frames reach the
        // screen, which shows up as rectangular tile seams across the field.
      });
      if (!context) {
        fail("no webgl2 context");
        return;
      }
      const gl = context;

      const backdrop = link(gl, BACKDROP_VERTEX, BACKDROP_FRAGMENT);
      const blades = link(gl, VERTEX_SHADER, FRAGMENT_SHADER);
      const chaff = link(gl, CHAFF_VERTEX, CHAFF_FRAGMENT);

      const u = (program: WebGLProgram, name: string) => gl.getUniformLocation(program, name);

      // The calm term every pass shares (CALM in shaders.ts).
      const calmU = (program: WebGLProgram) => ({
        clear: u(program, "uClear"),
        clearSoft: u(program, "uClearSoft"),
        calmTop: u(program, "uCalmTop"),
        calmSoft: u(program, "uCalmSoft"),
      });

      const backdropU = {
        resolution: u(backdrop, "uResolution"),
        grow: u(backdrop, "uGrow"),
        gold: u(backdrop, "uGold"),
        ink: u(backdrop, "uInk"),
        warmScale: u(backdrop, "uWarmScale"),
        sky: u(backdrop, "uSky"),
        skyTone: u(backdrop, "uSkyTone"),
        warmth: u(backdrop, "uWarmth"),
        horizon: u(backdrop, "uHorizon"),
        lightX: u(backdrop, "uLightX"),
        minkaX: u(backdrop, "uMinkaX"),
        sun: u(backdrop, "uSun"),
        moon: u(backdrop, "uMoon"),
        time: u(backdrop, "uTime"),
        scene: u(backdrop, "uScene"),
        sceneH: u(backdrop, "uSceneH"),
        calm: calmU(backdrop),
      };
      const bladeU = {
        resolution: u(blades, "uResolution"),
        sceneH: u(blades, "uSceneH"),
        time: u(blades, "uTime"),
        intro: u(blades, "uIntro"),
        pointer: u(blades, "uPointer"),
        pointerActive: u(blades, "uPointerActive"),
        baseY: u(blades, "uBaseY"),
        height: u(blades, "uHeight"),
        width: u(blades, "uWidth"),
        windScale: u(blades, "uWindScale"),
        parallax: u(blades, "uParallax"),
        bandSpread: u(blades, "uBandSpread"),
        color: u(blades, "uColor"),
        alpha: u(blades, "uAlpha"),
        solidity: u(blades, "uSolidity"),
        calm: calmU(blades),
      };
      const chaffU = {
        resolution: u(chaff, "uResolution"),
        sceneH: u(chaff, "uSceneH"),
        time: u(chaff, "uTime"),
        grow: u(chaff, "uGrow"),
        color: u(chaff, "uColor"),
        lift: u(chaff, "uLift"),
        calm: calmU(chaff),
      };

      const field = createField(BLADE_COUNT);
      const styles = Array.from({ length: BANDS }, (_, b) => bandStyle(b));

      // Blades
      const bladeVao = gl.createVertexArray();
      gl.bindVertexArray(bladeVao);
      const quadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, bladeGeometry(), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const instanceBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, instanceData(field), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribDivisor(1, 1);
      gl.vertexAttribDivisor(2, 1);

      // Chaff
      const chaffVao = gl.createVertexArray();
      gl.bindVertexArray(chaffVao);
      const chaffQuad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, chaffQuad);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const chaffBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, chaffBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, chaffData(), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(1, 1);

      // Backdrop needs no attributes — the triangle is generated from gl_VertexID.
      const emptyVao = gl.createVertexArray();

      gl.bindVertexArray(null);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      // Premultiplied — every fragment shader here emits colour * alpha.
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      paletteRef.current = readPalette(canvas);
      const themeObserver = new MutationObserver(() => {
        paletteRef.current = readPalette(canvas);
        // Oat milk to steel-cut is switched from Advanced Settings, where the
        // field is frozen. Without this the world keeps yesterday's palette.
        wakeRef.current?.();
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      });
      cleanupFns.push(() => themeObserver.disconnect());

      // The canvas's size, kept by the observer rather than read every
      // frame: a layout read inside a frame forces layout whenever anything else
      // on the page changed first. Read here once so the first frame can draw.
      // CSS px for the scene, and the device pixels the canvas covers for the
      // backing store (0 until the observer has measured them).
      let width = canvas.clientWidth;
      let height = canvas.clientHeight;
      let deviceWidth = 0;
      let deviceHeight = 0;
      // Applied in the frame that draws, not in the observer: resizing the
      // backing store clears it, and a cleared canvas left for a frame flickers.
      const applySize = () => {
        if (!width || !height) return false;
        const { w: pixelW, h: pixelH } = backingSize(
          width,
          height,
          deviceWidth,
          deviceHeight,
          window.devicePixelRatio || 1
        );
        if (canvas.width !== pixelW || canvas.height !== pixelH) {
          canvas.width = pixelW;
          canvas.height = pixelH;
          gl.viewport(0, 0, pixelW, pixelH);
        }
        return true;
      };
      const resizeObserver = new ResizeObserver((entries) => {
        // Layout is fresh inside an observer callback, so these reads are free.
        const entry = entries[entries.length - 1];
        const css = entry?.contentBoxSize?.[0];
        const device = entry?.devicePixelContentBoxSize?.[0];
        width = css ? css.inlineSize : canvas.clientWidth;
        height = css ? css.blockSize : canvas.clientHeight;
        deviceWidth = device ? device.inlineSize : 0;
        deviceHeight = device ? device.blockSize : 0;
        wakeRef.current?.();
      });
      observeDevicePixels(resizeObserver, canvas);
      cleanupFns.push(() => resizeObserver.disconnect());
      cleanupFns.push(watchPixelRatio(() => wakeRef.current?.()));

      const vertexCount = (BLADE_SEGMENTS + 1) * 2;
      let density = 1;
      let reductions = 0;
      const frameTimes: number[] = [];

      // `grow` eases toward whether a conversation is live: 1 grows the wheat,
      // 0 lets it withdraw and leaves the world behind.
      let grow = reduced && live ? 1 : 0;
      let growStartedAt = 0;
      let growFrom = grow;
      let lastLive = live;

      // The countryside rides `grow` itself — no timing of its own.
      const sceneId = SCENE_IDS[scene];

      // Animation time: the wall clock, less any time spent paused.
      const clock = createFieldClock(performance.now());
      let lastElapsed = 0;

      // The world only moves on the Conversation surface, for a user who wants
      // motion, and while somebody can see it; and for the length of a move to
      // another screen's picture.
      const loopState = () =>
        fieldLoopState({
          animate: animateRef.current,
          reduced,
          visible: visibleRef.current,
          easing: pictureRef.current.at !== null,
        });

      /** The composition's calm, in device pixels with GL's origin at the bottom-left. */
      const setCalm = (
        calm: ReturnType<typeof calmU>,
        picture: FieldComposition,
        cssW: number,
        cssH: number
      ) => {
        const sx = canvas.width / cssW;
        const sy = canvas.height / cssH;
        const { clear, calmTop } = picture;
        gl.uniform4f(
          calm.clear,
          clear.left * sx,
          (cssH - clear.bottom) * sy,
          clear.right * sx,
          (cssH - clear.top) * sy
        );
        gl.uniform1f(calm.clearSoft, clear.feather * sx);
        gl.uniform1f(calm.calmTop, (cssH - calmTop) * sy);
        gl.uniform1f(calm.calmSoft, calmTop > 0 ? CALM_TOP_FEATHER * sy : 0);
      };

      const drawFrame = (elapsedMs: number, still: boolean) => {
        if (!applySize()) return;
        const palette = paletteRef.current;
        if (!palette) return;

        const isLive = liveRef.current;
        if (isLive !== lastLive) {
          lastLive = isLive;
          growFrom = grow;
          growStartedAt = elapsedMs;
        }
        if (still) {
          // Snap rather than freeze mid-transition: a still frame of half-grown
          // wheat is an animation somebody paused, not a settled world.
          grow = isLive ? 1 : 0;
        } else {
          const span = isLive ? INTRO_MS : RECEDE_MS;
          const p = Math.min(1, Math.max(0, (elapsedMs - growStartedAt) / span));
          const eased = 1 - Math.pow(1 - p, 3);
          grow = growFrom + ((isLive ? 1 : 0) - growFrom) * eased;
        }

        const time = still ? 0 : elapsedMs / 1000;
        const pointer = still ? null : pointerRef.current;
        // At most one frame's worth: across a stop, the parting moves one step.
        const dt = Math.min(FRAME_INTERVAL_MS, Math.max(0, elapsedMs - lastElapsed));
        lastElapsed = elapsedMs;

        gl.clear(gl.COLOR_BUFFER_BIT);
        const sceneH = sceneFrame(height, sceneHeightRef.current).scale;
        // Where the move toward the next picture has got to.
        const picture = pictureAt(
          pictureRef.current,
          performance.now(),
          MOVE_MS,
          reduced || !visibleRef.current
        );

        // 1. Backdrop — the world.
        gl.useProgram(backdrop);
        gl.bindVertexArray(emptyVao);
        gl.uniform2f(backdropU.resolution, width, height);
        gl.uniform1f(backdropU.grow, grow);
        gl.uniform3f(backdropU.gold, palette.gold[0], palette.gold[1], palette.gold[2]);
        gl.uniform3f(backdropU.ink, palette.ink[0], palette.ink[1], palette.ink[2]);
        gl.uniform1f(backdropU.warmScale, palette.warmScale);
        gl.uniform1f(backdropU.sky, picture.sky);
        gl.uniform1f(backdropU.skyTone, picture.skyTone);
        gl.uniform1f(backdropU.warmth, picture.warmth);
        gl.uniform1f(backdropU.horizon, picture.horizon);
        gl.uniform1f(backdropU.lightX, picture.lightX);
        gl.uniform1f(backdropU.minkaX, picture.minkaX);
        gl.uniform3f(backdropU.sun, picture.sun.x, picture.sun.y, picture.sun.r);
        gl.uniform3f(backdropU.moon, picture.moon.x, picture.moon.y, picture.moon.r);
        gl.uniform1f(backdropU.time, time);
        gl.uniform1i(backdropU.scene, sceneId);
        gl.uniform1f(backdropU.sceneH, sceneH);
        setCalm(backdropU.calm, picture, width, height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // 2. Blades — far to near, so nearer ones draw over the ones behind.
        const strength = picture.wheat;
        if (grow > 0.001 && strength > 0.01) {
          gl.useProgram(blades);
          gl.bindVertexArray(bladeVao);
          gl.uniform2f(bladeU.resolution, width, height);
          gl.uniform1f(bladeU.sceneH, sceneH);
          setCalm(bladeU.calm, picture, width, height);
          gl.uniform1f(bladeU.time, time);
          gl.uniform1f(bladeU.intro, grow);
          // Ease toward presence rather than switching. As a flag the parting
          // dropped between two frames when the cursor left, which reads as a
          // twitch in whatever it was next to. Holding the last position means
          // the wheat closes where it was opened rather than snapping shut.
          // Eased by time, not per frame, so the frame rate cannot change it;
          // and a still frame has no parting at all, since at rest the cursor
          // does nothing.
          if (pointer) pointerLastRef.current = pointer;
          pointerFadeRef.current = still
            ? 0
            : easeToward(pointerFadeRef.current, pointer ? 1 : 0, dt, POINTER_EASE);
          if (pointerFadeRef.current < 0.002) pointerFadeRef.current = 0;
          const held = pointer ?? pointerLastRef.current;
          gl.uniform2f(bladeU.pointer, held?.x ?? 0, held?.y ?? 0);
          gl.uniform1f(bladeU.pointerActive, held ? pointerFadeRef.current : 0);

          gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
          for (let band = 0; band < BANDS; band += 1) {
            const style = styles[band];
            // Where this band stands under the picture's horizon.
            const place = bandPlacement(band, picture.horizon);
            const range = field.bands[band];
            const count = Math.max(1, Math.floor(range.count * density));
            const offset = range.start * STRIDE_BYTES;

            gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE_BYTES, offset);
            gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE_BYTES, offset + 16);

            gl.uniform1f(bladeU.baseY, place.baseY);
            gl.uniform1f(bladeU.height, place.height);
            gl.uniform1f(bladeU.width, style.width);
            gl.uniform1f(bladeU.windScale, style.windScale);
            gl.uniform1f(bladeU.parallax, style.parallax);
            gl.uniform1f(bladeU.bandSpread, place.spread);
            gl.uniform1f(bladeU.alpha, style.alpha * strength);
            gl.uniform1f(bladeU.solidity, style.solidity);
            const colour = palette.bandColors[band];
            gl.uniform3f(bladeU.color, colour[0], colour[1], colour[2]);

            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, vertexCount, count);
          }
        }

        // 3. Chaff — atmosphere, and the reason the settled field never reads as
        //    a still image.
        if (grow > 0.02 && strength > 0.3 && !still) {
          gl.useProgram(chaff);
          gl.bindVertexArray(chaffVao);
          gl.uniform2f(chaffU.resolution, width, height);
          gl.uniform1f(chaffU.sceneH, sceneH);
          gl.uniform1f(chaffU.time, time);
          gl.uniform1f(chaffU.grow, grow);
          gl.uniform3f(chaffU.color, palette.gold[0], palette.gold[1], palette.gold[2]);
          gl.uniform1f(chaffU.lift, HORIZON - picture.horizon);
          setCalm(chaffU.calm, picture, width, height);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, CHAFF_COUNT);
        }

        gl.bindVertexArray(null);
      };

      /** rAF timestamp of the last moving frame, for the cap and the density sample. */
      let lastDrawAt = -Infinity;
      let sampling = false;

      const requestFrame = () => {
        timer = 0;
        if (!disposed && !raf) raf = requestAnimationFrame(tick);
      };

      const tick = (now: number) => {
        raf = 0;
        if (disposed) return;
        const state = loopState();

        // Nobody can see it: nothing drawn, nothing scheduled. `wake` brings
        // it back when that changes.
        if (state === "paused") return;

        // Settled: draw the frame the world rests at, then stop scheduling.
        // Returning without re-arming is the whole point — an rAF callback that
        // does nothing still holds the compositor at vsync, which is the cost
        // this is here to avoid.
        if (state === "still") {
          drawFrame(clock.elapsed(now), true);
          return;
        }

        // Moving to another screen's picture, with no wind: a frame per vsync
        // for MOVE_MS (a move at 30 fps steps visibly), each the still frame of
        // the picture so far, and the last one is the settled picture.
        if (state === "easing") {
          drawFrame(clock.elapsed(now), true);
          if (pictureRef.current.at !== null) raf = requestAnimationFrame(tick);
          return;
        }

        // A zero-size canvas has nothing to draw; the resize observer wakes
        // the loop when it has.
        if (!width || !height) return;

        // At most FIELD_FPS: between frames the loop sleeps on a timer and asks
        // for no vsync at all.
        if (!frameDue(now, lastDrawAt)) {
          timer = window.setTimeout(requestFrame, frameDelay(now, lastDrawAt));
          return;
        }

        const elapsed = clock.elapsed(now);
        drawFrame(elapsed, false);

        if (sampling && elapsed > INTRO_MS && reductions < 2) {
          frameTimes.push(now - lastDrawAt);
          if (frameTimes.length >= SAMPLE_WINDOW) {
            const sorted = frameTimes.slice().sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            frameTimes.length = 0;
            if (median > FRAME_BUDGET_MS) {
              density = Math.max(MIN_DENSITY, density * 0.62);
              reductions += 1;
            }
          }
        }
        sampling = true;
        lastDrawAt = now;

        // The world at rest, on the Conversation surface, with no conversation
        // running: the wheat is gone, the chaff and the blades are gated on
        // `grow`, and the backdrop reads `uTime` only inside `uGrow > 0` (the
        // birds). Every frame from here is byte-identical to this one.
        //
        // Idling on that cost 113% of a core on the Linux target, because the
        // build composites in software (`--disable-gpu-compositing`) and reads
        // the whole canvas back every frame. Redrawing an unchanging picture
        // sixty times a second is not the beautiful moment §9.8 asks for; it is
        // a laptop battery. `wake` brings it straight back when someone
        // presses record.
        if (!liveRef.current && grow <= AT_REST) return;

        timer = window.setTimeout(requestFrame, frameDelay(performance.now(), lastDrawAt));
      };

      // Something changed: the loop decides what that means. Starts a stopped
      // loop for one frame, or for good if the world is moving again; stops it,
      // and its clock, when nobody can see it. Also the only way a settled
      // field ever redraws.
      const wake = () => {
        if (disposed) return;
        const now = performance.now();
        const state = loopState();
        if (state === "paused") {
          clock.pause(now);
          cancelAnimationFrame(raf);
          window.clearTimeout(timer);
          raf = 0;
          timer = 0;
          return;
        }
        clock.resume(now);
        // Already moving: the next frame picks the change up.
        if ((state === "moving" || state === "easing") && (raf || timer)) return;
        // A frame interval measured across a stop is not a frame that was
        // slow; left in, it would thin the field on the first frame back.
        sampling = false;
        frameTimes.length = 0;
        window.clearTimeout(timer);
        timer = 0;
        if (!raf) raf = requestAnimationFrame(tick);
      };
      wakeRef.current = wake;
      cleanupFns.push(() => {
        if (wakeRef.current === wake) wakeRef.current = null;
      });
      wake();

      const onContextLost = (event: Event) => {
        event.preventDefault();
        fail("context lost");
      };
      canvas.addEventListener("webglcontextlost", onContextLost);

      return () => {
        disposed = true;
        cancelAnimationFrame(raf);
        window.clearTimeout(timer);
        canvas.removeEventListener("webglcontextlost", onContextLost);
        cleanupFns.forEach((fn) => fn());
        gl.deleteBuffer(quadBuffer);
        gl.deleteBuffer(instanceBuffer);
        gl.deleteBuffer(chaffQuad);
        gl.deleteBuffer(chaffBuffer);
        gl.deleteVertexArray(bladeVao);
        gl.deleteVertexArray(chaffVao);
        gl.deleteVertexArray(emptyVao);
        gl.deleteProgram(backdrop);
        gl.deleteProgram(blades);
        gl.deleteProgram(chaff);
      };
    } catch (error) {
      cleanupFns.forEach((fn) => fn());
      fail(error instanceof Error ? error.message : String(error));
      return;
    }
    // `live` is deliberately absent: it is read through `liveRef` on every
    // frame, and rebuilding the GL context on a recording transition would
    // discard the grow/recede state that the transition exists to animate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, onFailure, scene]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}
