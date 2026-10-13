import { HOP, tumbleHeight } from "../../helpers/oatsMarkMotion.mjs";
import { ditherGrain, stippleShadow } from "../../helpers/grainDither.mjs";

/**
 * The Oats symbol's grain, painted into a canvas: the drawing the symbol had
 * as SVG (the same outline, transforms and gradients), drawn as a tone and then
 * resolved into a small honey palette by ordered dither on device pixels
 * (`helpers/grainDither.mjs`), the way the field dithers its sky.
 *
 * A canvas rather than an SVG filter, because the dither has to sit on device
 * pixels: the canvas is sized to its box in device pixels, so each dot is one
 * pixel at every size and pixel ratio, where an SVG filter's pattern would be
 * resampled with the drawing. It is also cheap. Only the toss draws more than
 * once, and a frame of the 20px sidebar mark at 2x is about 1,600 pixels.
 */

/** One frame of the toss: what `tossFrame()` returns. */
export interface GrainPose {
  phi: number;
  hop: number;
  squash: number;
  lean: number;
}

export const AT_REST: GrainPose = { phi: 0, hop: 0, squash: 0, lean: 0 };

/**
 * The light, as tone: 0 is the palette's deepest amber, 1 its warmest honey.
 * It comes from the upper left. Softer than the SVG's: no specular bloom, no
 * highlight dot, and a top that stops at warm honey, so nothing reads as a glow.
 */
const LIGHT = {
  /** The body, a radial falloff from the upper left: [offset, tone] stops. */
  body: [
    [0, 0.94],
    [0.36, 0.82],
    [0.72, 0.62],
    [1, 0.34],
  ],
  /** How much the lower right darkens. */
  shade: 0.28,
  /** Light bounced back onto the lower edge. */
  bounce: 0.12,
  /** The crease, and the catch-light on its lip. */
  crease: 0.7,
  lip: 0.35,
  /** A darker rim inside the edge, so the grain holds its shape on a light page. */
  rim: 0.35,
};

// The grain in a 1024 box: centred, 688 tall, 480 wide at its widest.
const CX = 512;
const CY = 512;
const HALF_HEIGHT = 344;
const HALF_WIDTH = 240;
const OUTLINE =
  "M512 168 C584 168 752 326 752 512 C752 700 588 856 512 856 C436 856 272 700 272 512 C272 326 440 168 512 168 Z";
/** The outline's bounding box, which its gradients are laid out in. */
const BOX = { x: 272, y: 168, width: 480, height: 688 };
/** The tilt that gives it some life. */
const TILT = -18;
/** Where the crease sits, as an angle round the long axis (0 is the middle). */
const REST = 0.34;
const GROOVE_FROM = 252;
const GROOVE_TO = 772;
/** Where it lands, which is where the squash comes from, and its shadow. */
const FOOT = 880;
const GROUND = { y: 920, rx: 236, ry: 36, strength: 0.3 };

/** The crease at its resting place: a line down the front, following its curve. */
function groove(theta: number): Path2D {
  const across = Math.sin(theta);
  const line = new Path2D();
  for (let i = 0; i <= 16; i += 1) {
    const y = GROOVE_FROM + ((GROOVE_TO - GROOVE_FROM) * i) / 16;
    const t = (y - CY) / HALF_HEIGHT;
    const x = CX + HALF_WIDTH * Math.sqrt(Math.max(0, 1 - t * t)) * across;
    if (i === 0) line.moveTo(x, y);
    else line.lineTo(x, y);
  }
  return line;
}

let paths: { outline: Path2D; outlineInBox: Path2D; crease: Path2D } | null = null;

/** Built on first use, since a Path2D needs a DOM. */
function grainPaths() {
  if (!paths) {
    const outline = new Path2D(OUTLINE);
    const outlineInBox = new Path2D();
    outlineInBox.addPath(
      outline,
      new DOMMatrix().scaleSelf(1 / BOX.width, 1 / BOX.height).translateSelf(-BOX.x, -BOX.y)
    );
    paths = { outline, outlineInBox, crease: groove(REST) };
  }
  return paths;
}

/** 0 when the crease faces away, 1 once it faces us properly. */
function visibility(facing: number) {
  const x = Math.min(1, Math.max(0, facing / 0.35));
  return x * x * (3 - 2 * x);
}

const grey = (tone: number, alpha = 1) => {
  const level = Math.round(Math.min(1, Math.max(0, tone)) * 255);
  return `rgba(${level}, ${level}, ${level}, ${alpha})`;
};

/**
 * A linear gradient given in the outline's bounding box, as an SVG
 * `objectBoundingBox` gradient is, made in user space with the same lines of
 * equal colour (a stroke cannot be drawn in the box's squashed space).
 */
function boxGradient(
  context: CanvasRenderingContext2D,
  [x1, y1]: [number, number],
  [x2, y2]: [number, number]
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const gx = dx / (BOX.width * length);
  const gy = dy / (BOX.height * length);
  const g = gx * gx + gy * gy;
  const startX = BOX.x + x1 * BOX.width;
  const startY = BOX.y + y1 * BOX.height;
  return context.createLinearGradient(startX, startY, startX + gx / g, startY + gy / g);
}

/**
 * Paint the grain in one pose into a canvas `width` x `height` device pixels,
 * the 1024 box fitted into it. A `shadow` is stippled under it for large sizes.
 */
export function paintGrain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  pose: GrainPose,
  shadow = false
) {
  const { outline, outlineInBox, crease } = grainPaths();
  const scale = Math.min(width, height) / 1024;
  const left = (width - 1024 * scale) / 2;
  const top = (height - 1024 * scale) / 2;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.filter = "none";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.clearRect(0, 0, width, height);

  // The SVG's nesting: the hop and the squash from the foot, the tilt, then the
  // tumble's foreshortening.
  const squashX = 1 + 0.06 * pose.squash;
  const squashY = 1 - 0.08 * pose.squash;
  context.setTransform(
    new DOMMatrix()
      .translateSelf(left, top)
      .scaleSelf(scale, scale)
      .translateSelf(0, -pose.hop)
      .translateSelf(CX, FOOT)
      .scaleSelf(squashX, squashY)
      .translateSelf(-CX, -FOOT)
      .translateSelf(CX, CY)
      .rotateSelf(TILT + pose.lean)
      .scaleSelf(1, tumbleHeight(pose.phi))
      .translateSelf(-CX, -CY)
  );

  // The body, lit from the upper left. Its gradient is laid out in the
  // outline's box, so it is drawn there.
  context.save();
  context.transform(BOX.width, 0, 0, BOX.height, BOX.x, BOX.y);
  const body = context.createRadialGradient(0.33, 0.22, 0, 0.36, 0.26, 0.84);
  for (const [offset, tone] of LIGHT.body) body.addColorStop(offset, grey(tone));
  context.fillStyle = body;
  context.fill(outlineInBox);
  context.restore();

  // Everything else lies on the body: drawn only where it is, keeping its edge.
  context.globalCompositeOperation = "source-atop";
  const shade = boxGradient(context, [0.15, 0.1], [0.95, 0.92]);
  shade.addColorStop(0.45, grey(0, 0));
  shade.addColorStop(1, grey(0, LIGHT.shade));
  context.fillStyle = shade;
  context.fill(outline);

  // Light bounced back onto the lower edge: the depth cue that makes it read
  // as a soft object rather than a flat shape.
  const bounce = boxGradient(context, [0, 1], [0.75, 0.25]);
  bounce.addColorStop(0, grey(1, LIGHT.bounce));
  bounce.addColorStop(0.55, grey(1, 0));
  context.strokeStyle = bounce;
  context.lineWidth = 44;
  context.stroke(outline);

  // The crease is on the front: it turns away as the grain tumbles over. It is
  // never thinner than about a device pixel, or the dither swallows it at
  // sidebar size, and its lip, which catches the light, sits beside it rather
  // than on it.
  const seen = visibility(Math.cos(pose.phi));
  if (seen > 0) {
    const pixel = 1 / scale;
    const creaseWidth = Math.max(30, 1.25 * pixel);
    const lipWidth = Math.max(10, 0.75 * pixel);
    const lipShift = 0.4 * (creaseWidth + lipWidth) * Math.cos(REST);
    context.filter = `blur(${(4 * scale).toFixed(2)}px)`;
    context.globalAlpha = LIGHT.crease * seen;
    context.strokeStyle = grey(0);
    context.lineWidth = creaseWidth;
    context.stroke(crease);
    context.translate(-lipShift, 0);
    context.globalAlpha = LIGHT.lip * seen;
    context.strokeStyle = grey(1);
    context.lineWidth = lipWidth;
    context.stroke(crease);
    context.translate(lipShift, 0);
    context.globalAlpha = 1;
    context.filter = "none";
  }

  context.strokeStyle = grey(0, LIGHT.rim);
  context.lineWidth = 12;
  context.stroke(outline);
  context.globalCompositeOperation = "source-over";

  const image = context.getImageData(0, 0, width, height);
  ditherGrain(image.data, width);
  if (shadow) {
    // The shadow shrinks and fades while the grain is in the air.
    const lift = Math.min(1, pose.hop / HOP);
    const spread = scale * (1 - 0.35 * lift);
    stippleShadow(image.data, width, {
      cx: left + CX * scale,
      cy: top + GROUND.y * scale,
      rx: GROUND.rx * spread,
      ry: GROUND.ry * spread,
      strength: GROUND.strength * (1 - 0.55 * lift),
    });
  }
  context.putImageData(image, 0, 0);
}
