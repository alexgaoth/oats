import {
  WIND,
  POINTER_RADIUS,
  HORIZON,
  SUN_X,
  SKY_BLUE,
  SKY_BLOOM_ALPHA,
  SKY_LIGHT_BOOST,
  MINKA,
  BIRDS,
} from "./fieldModel";

// GLSL for the field. The wind constants are interpolated from `WIND` rather
// than written out again, so the shader and `windAt()` in fieldModel.ts cannot
// drift apart — the 2D fallback and the GPU path are the same field by
// construction, not by care.

const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

// Ordered (Bayer) dithering, shared by every pass in this canvas. DESIGN.md §7
// requires the grain be crisp and locked to device pixels, which is why it is
// indexed off gl_FragCoord rather than a UV — and why exactly one canvas draws
// all of it, satisfying "one animated dither layer, ever".
const BAYER = `
const float bayer[16] = float[16](
   0.0,  8.0,  2.0, 10.0,
  12.0,  4.0, 14.0,  6.0,
   3.0, 11.0,  1.0,  9.0,
  15.0,  7.0, 13.0,  5.0
);

float bayerThreshold() {
  ivec2 cell = ivec2(mod(gl_FragCoord.xy, 4.0));
  return (bayer[cell.y * 4 + cell.x] + 0.5) / 16.0;
}
`;

// A fullscreen triangle. Cheaper than a quad and avoids the diagonal seam.
export const BACKDROP_VERTEX = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

// Sky, sun, horizon, earth — the world the field stands in.
//
// Dithering a gradient is the single best use of ordered dither in the product:
// what would otherwise be visible banding becomes deliberate grain. This is a
// stronger carrier of the brand than the blades are.
export const BACKDROP_FRAGMENT = `#version 300 es
precision mediump float;

in vec2 vUv;                 // 0 at bottom-left, 1 at top-right

uniform vec2  uResolution;
uniform float uGrow;         // 0 idle, 1 fully live — warms the whole world
uniform vec3  uGold;
uniform vec3  uInk;
uniform float uWarmScale;    // gold is darker than paper and lighter than charcoal
uniform float uSkyStrength;
uniform float uTime;         // seconds — only the epilogue reads it
uniform float uEpilogue;     // 0..1, the post-recording scene's presence
uniform int   uScene;        // 0 off, 1 clear sky, 2 minka, 3 full dithered scene
uniform int   uMinkaStyle;   // 1 irimoya, 2 gassho, 3 hamlet (irimoya + kura + tree)

out vec4 fragColor;
${BAYER}

void main() {
  float horizon = 1.0 - ${f(HORIZON)};   // measured from the bottom here
  float y = vUv.y;

  // Light on this surface is a wash, not a disc.
  //
  // A literal sun cannot work in both modes: on oat-milk paper gold is *darker*
  // than the background, so a bright disc reads as a stain, and mixing it toward
  // white makes it vanish against near-white paper. What does work on paper is
  // what a watercolourist would do — warm the horizon asymmetrically, so the
  // light has a direction and an origin without ever drawing its source. The
  // same term reads as a genuine glow in Steel-cut, where gold is brighter than
  // the charcoal.
  float above = clamp((y - horizon) / (1.0 - horizon), 0.0, 1.0);
  float glow = pow(1.0 - above, 2.6) * step(horizon, y);

  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float dx = (vUv.x - ${f(SUN_X)}) * aspect;
  // Never fully dark on the far side — this is one light source in an open
  // field, not a spotlight.
  float sunward = 0.42 + 0.58 * exp(-dx * dx / 0.42);

  // Earth below the horizon: a faint warm wash so the field has ground under it
  // rather than floating on the page. Lit from the same side.
  float below = clamp((horizon - y) / horizon, 0.0, 1.0);
  float earth = pow(below, 1.4) * step(y, horizon);

  // The horizon itself — about one device pixel, fading out toward the edges so
  // it reads as distance rather than as a drawn rule. Brightest under the light.
  float linePx = abs(y - horizon) * uResolution.y;
  float line = exp(-linePx * linePx / 2.2);
  float edgeFade = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);

  float warmth = (glow * 0.5 + earth * 0.3) * sunward * uSkyStrength;
  warmth *= mix(0.6, 1.0, uGrow) * uWarmScale;

  // The hairline falls away faster than the wash. On a reading surface a wash is
  // atmosphere, but a hard 1px line drawn straight through a paragraph is the
  // exact thing §9.8 forbids.
  float inkAmount = line * edgeFade * 0.42 * mix(0.45, 1.0, uGrow) * uSkyStrength * uSkyStrength;

  float coverage = clamp(warmth + inkAmount, 0.0, 1.0);
  float threshold = bayerThreshold();

  // Dither the warm world as one field of grain. Banding becomes deliberate.
  float warmAlpha =
    coverage >= max(threshold, 0.004) ? clamp(coverage * 1.1, 0.0, 0.45) : 0.0;
  vec3 warmColour = mix(uGold, uInk, clamp(inkAmount / max(coverage, 0.0001), 0.0, 1.0));

  // --- The epilogue: what arrives after a conversation ends ----------------
  // Scenes 1 and 3, "sky": the sky clears. A desaturated slate blue blooms
  // from the top of the frame down toward the horizon, and the warm light
  // keeps the horizon — a clear evening, not a new wallpaper. Scene 1 is the
  // smooth 'normal style'; scene 3 spells the same gradient in dither density,
  // so the whole sky is grain.
  vec3 epilogueRgb = vec3(0.0);
  float epilogueAlpha = 0.0;
  if ((uScene == 1 || uScene == 3) && uEpilogue > 0.001) {
    float bloom = pow(above, 0.85) * uEpilogue * uSkyStrength;
    epilogueRgb = vec3(${f(SKY_BLUE[0])}, ${f(SKY_BLUE[1])}, ${f(SKY_BLUE[2])});
    // Blue over near-white paper washes out, so oat milk gets a deeper pour.
    // warmScale < 0.75 is exactly the renderer's "this is paper" signal.
    float skyAlpha = ${f(SKY_BLOOM_ALPHA)} * (uWarmScale < 0.75 ? ${f(SKY_LIGHT_BOOST)} : 1.0);
    if (uScene == 3) {
      epilogueAlpha = bloom * 0.9 >= threshold ? min(skyAlpha * 1.35, 0.5) : 0.0;
    } else {
      epilogueAlpha = bloom * skyAlpha;
    }
  }

  // Composite: the warm atmosphere sits in front of the far sky.
  float alpha = warmAlpha + epilogueAlpha * (1.0 - warmAlpha);
  vec3 colour = warmColour * warmAlpha + epilogueRgb * epilogueAlpha * (1.0 - warmAlpha);

  // Scenes 2 and 3, "minka": a dwelling in the far countryside, sitting on
  // the horizon opposite the light. It condenses out of grain — dither density
  // ramps with the epilogue, the same vocabulary the far blades use for
  // distance — rather than fading or sliding in. Geometry mirrors
  // minkaHalfWidthAt()/kuraHalfWidthAt() in fieldModel.ts, same constants.
  // The concave roof sweep is the cultural cue; straight edges read as a barn.
  if (uScene >= 2 && uEpilogue > 0.001) {
    float hy = y - horizon;                        // height units above the horizon
    float sx = (vUv.x - ${f(MINKA.x)}) * aspect;   // signed, for offset companions
    float px = 1.5 / max(uResolution.y, 1.0);      // soften edges by ~1.5 CSS px

    // Main house half-width at this height.
    float halfW = 0.0;
    if (uMinkaStyle == 2) {
      // gassho: steep thatched triangle, slight concave flare at the eaves.
      if (hy <= ${f(MINKA.gasshoBodyH)}) {
        halfW = ${f(MINKA.gasshoBodyHalf)};
      } else {
        float t = (hy - ${f(MINKA.gasshoBodyH)}) / ${f(MINKA.gasshoH)};
        if (t <= 1.0) {
          halfW = ${f(MINKA.gasshoRidgeHalf)}
                + ${f(MINKA.gasshoEaveHalf - MINKA.gasshoRidgeHalf)} * pow(1.0 - t, ${f(MINKA.gasshoCurve)});
        }
      }
    } else {
      // irimoya: concave hip sweep, gable tier, raised ridge cap.
      if (hy <= ${f(MINKA.bodyH)}) {
        halfW = ${f(MINKA.bodyHalf)};
      } else {
        float hipT = (hy - ${f(MINKA.bodyH)}) / ${f(MINKA.hipH)};
        if (hipT <= 1.0) {
          halfW = ${f(MINKA.gableHalf)}
                + ${f(MINKA.hipEaveHalf - MINKA.gableHalf)} * pow(1.0 - hipT, ${f(MINKA.hipCurve)});
        } else {
          float gableT = (hy - ${f(MINKA.bodyH + MINKA.hipH)}) / ${f(MINKA.gableH)};
          if (gableT <= 1.0) {
            halfW = ${f(MINKA.ridgeHalf)} + ${f(MINKA.gableHalf - MINKA.ridgeHalf)} * (1.0 - gableT);
          } else if (hy - ${f(MINKA.bodyH + MINKA.hipH + MINKA.gableH)} <= ${f(MINKA.capH)}) {
            halfW = ${f(MINKA.capHalf)};
          }
        }
      }
    }
    float inside = (hy >= 0.0 && halfW > 0.0) ? smoothstep(halfW, halfW - px, abs(sx)) : 0.0;

    // The hamlet keeps company: a kura storehouse and a lone tree. The tree's
    // canopy dithers looser than the buildings — grown, not built.
    float treeInside = 0.0;
    if (uMinkaStyle == 3 && hy >= 0.0) {
      float kx = abs(sx - ${f(MINKA.kuraDx)});
      float kHalf = 0.0;
      if (hy <= ${f(MINKA.kuraBodyH)}) {
        kHalf = ${f(MINKA.kuraHalf)};
      } else {
        float kt = (hy - ${f(MINKA.kuraBodyH)}) / ${f(MINKA.kuraRoofH)};
        if (kt <= 1.0) kHalf = mix(${f(MINKA.kuraRoofHalf)}, 0.002, kt);
      }
      if (kHalf > 0.0) inside = max(inside, smoothstep(kHalf, kHalf - px, kx));

      vec2 td = vec2((sx - ${f(MINKA.treeDx)}) / ${f(MINKA.treeRx)},
                     (hy - ${f(MINKA.treeCy)}) / ${f(MINKA.treeRy)});
      treeInside = smoothstep(1.0, 0.9, length(td));
      float trunk = smoothstep(${f(MINKA.trunkHalf)}, ${f(MINKA.trunkHalf)} * 0.4,
                               abs(sx - ${f(MINKA.treeDx)}))
                  * step(hy, ${f(MINKA.trunkH)});
      inside = max(inside, trunk);
    }

    float density = max(inside * 0.68, treeInside * 0.5) * uEpilogue;
    float minkaAlpha = density >= threshold ? 0.5 * uSkyStrength : 0.0;
    vec3 minkaRgb = mix(uInk, uGold, 0.3);

    colour = minkaRgb * minkaAlpha + colour * (1.0 - minkaAlpha);
    alpha = minkaAlpha + alpha * (1.0 - minkaAlpha);
  }

  // Scene 3 only: a few birds crossing the cleared sky, right to left. Specks
  // of grain whose size breathes as a wingbeat — at this distance a flap is a
  // shimmer, not an outline.
  if (uScene == 3 && uEpilogue > 0.001) {
    float birdCoverage = 0.0;
    for (int i = 0; i < ${BIRDS.count}; i++) {
      float fi = float(i);
      float bphase = fract(fi * 0.618 + 0.21);
      float bx = 1.1 - fract(uTime * ${f(BIRDS.speed)} + bphase) * 1.2;
      float byTop = ${f(BIRDS.yMin)} + fract(bphase * 7.31) * ${f(BIRDS.yMax - BIRDS.yMin)};
      float by = 1.0 - byTop + sin(uTime * 0.7 + fi) * 0.006;

      vec2 d = vec2((vUv.x - bx) * aspect, vUv.y - by);
      float r = length(d) * uResolution.y;
      float size = 1.6 + 0.9 * sin(uTime * 9.0 + fi * 2.4);
      birdCoverage = max(birdCoverage, smoothstep(size + 1.0, size - 0.5, r));
    }
    float birdDensity = birdCoverage * 0.8 * uEpilogue * uSkyStrength;
    float birdAlpha = birdDensity >= threshold ? 0.55 : 0.0;
    vec3 birdRgb = mix(uInk, uGold, 0.2);

    colour = birdRgb * birdAlpha + colour * (1.0 - birdAlpha);
    alpha = birdAlpha + alpha * (1.0 - birdAlpha);
  }

  if (alpha < 0.004) discard;
  fragColor = vec4(colour, alpha);
}
`;

// Chaff: a few dozen motes riding the same gusts as the blades. Atmosphere, and
// the thing that keeps the settled field from reading as a still image.
export const CHAFF_VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;   // unit quad, -1..1
layout(location = 1) in vec4 aMote;     // x, y, size, phase

uniform vec2  uResolution;
uniform float uTime;
uniform float uGrow;

out float vFade;

void main() {
  float phase = aMote.w;

  // Drift: slow rightward travel that wraps, plus a lazy vertical bob. Depth is
  // carried by size, so bigger motes also drift faster.
  float speed = 0.006 + aMote.z * 0.02;
  float x = fract(aMote.x + uTime * speed + phase * 0.13);
  float y = aMote.y + sin(uTime * 0.19 + phase) * 0.018 + cos(uTime * 0.11 + phase * 1.7) * 0.012;

  // Fade in and out over the crossing so nothing pops at the wrap point.
  vFade = sin(x * 3.14159) * uGrow;

  float px = aMote.z * (1.4 + aMote.z * 2.2);
  vec2 pos = vec2(x * uResolution.x, (1.0 - y) * uResolution.y) + aCorner * px;

  gl_Position = vec4(
    pos.x / uResolution.x * 2.0 - 1.0,
    1.0 - pos.y / uResolution.y * 2.0,
    0.0,
    1.0
  );
}
`;

export const CHAFF_FRAGMENT = `#version 300 es
precision mediump float;

in float vFade;
uniform vec3 uColor;

out vec4 fragColor;
${BAYER}

void main() {
  float coverage = clamp(vFade, 0.0, 1.0) * 0.34;
  if (coverage < bayerThreshold()) discard;
  float alpha = 0.5;
  fragColor = vec4(uColor * alpha, alpha);
}
`;

export const VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;   // x: side (-1 | +1), y: t along the blade
layout(location = 1) in vec4 aBladeA;   // x, spread within band, heightMul, lean
layout(location = 2) in vec4 aBladeB;   // phase, growDelay, growSpan, droop

uniform vec2  uResolution;     // CSS pixels
uniform float uTime;           // seconds since the field started
uniform float uIntro;          // 0..1 growth progress
uniform vec2  uPointer;        // CSS pixels
uniform float uPointerActive;  // 0 or 1
uniform float uBaseY;          // band root, fraction of height
uniform float uHeight;         // band blade height, fraction of height
uniform float uWidth;          // band blade width, CSS pixels
uniform float uWindScale;
uniform float uParallax;
uniform float uBandSpread;   // vertical gap to the next band, height fraction

out float vGrowth;
out float vEar;

// A gust centre travels from off-screen left to off-screen right, then gaps.
float gustCenter(float t, float speed, float offset) {
  return fract(t * speed + offset) * 1.6 - 0.3;
}

float gustEnvelope(float x, float centre, float width) {
  float d = (x - centre) / width;
  return exp(-d * d);
}

void main() {
  float side = aCorner.x;
  float t    = aCorner.y;

  float x         = aBladeA.x;
  float spread    = aBladeA.y;
  float heightMul = aBladeA.z;
  float lean      = aBladeA.w;
  float phase     = aBladeB.x;
  float growDelay = aBladeB.y;
  float growSpan  = aBladeB.z;
  float droop     = aBladeB.w;

  // Growth: ease-out cubic, no overshoot (DESIGN.md §8 forbids bounce).
  float p = clamp((uIntro - growDelay) / growSpan, 0.0, 1.0);
  float growth = 1.0 - pow(1.0 - p, 3.0);

  // Wind — mirrors windAt() in fieldModel.ts exactly.
  float ambient = sin(uTime * ${f(WIND.ambientFreqA)} + phase) * 0.62
                + sin(uTime * ${f(WIND.ambientFreqB)} + phase * 1.7) * 0.38;

  float gustA = gustEnvelope(x, gustCenter(uTime, ${f(WIND.gustSpeedA)}, 0.0), ${f(WIND.gustWidthA)});
  float gustB = gustEnvelope(x, gustCenter(uTime, ${f(WIND.gustSpeedB)}, ${f(WIND.gustOffsetB)}), ${f(WIND.gustWidthB)}) * ${f(WIND.gustStrengthB)};

  // A young blade is stiff. This one term is most of what makes the intro read
  // as growing rather than as scaling up.
  float stiffness = growth * growth;
  float wind = (lean + ambient * ${f(WIND.ambientAmp)} + (gustA + gustB) * ${f(WIND.gustAmp)}) * stiffness;

  // Spread the band's blades across the gap to the next one, and let the ones
  // that land nearer the front stand slightly taller, so neither the roots nor
  // the tops line up into a seam.
  float bandDepth = uBaseY + spread * uBandSpread;
  float bladeH = uHeight * (0.86 + spread * 0.28) * uResolution.y * heightMul * growth;
  float baseX  = x * uResolution.x;
  float baseY  = bandDepth * uResolution.y;

  // Depth parallax: the cursor's offset from centre shifts nearer bands further.
  float pointerOffset = (uPointer.x / uResolution.x - 0.5) * 2.0;
  baseX += pointerOffset * uParallax * uPointerActive;

  float bend = wind * bladeH * uWindScale * 0.3;

  // The field parts around the cursor — always sideways, so it opens rather
  // than flattens.
  if (uPointerActive > 0.5) {
    vec2 d = vec2(baseX - uPointer.x, baseY - uPointer.y);
    float dist = length(d);
    if (dist < ${f(POINTER_RADIUS)}) {
      float push = pow(1.0 - dist / ${f(POINTER_RADIUS)}, 2.0);
      bend += (d.x >= 0.0 ? 1.0 : -1.0) * push * bladeH * 0.55;
    }
  }

  // Width tapers toward the tip, with an ear swelling through the top third.
  // At the scale a background layer draws at, that silhouette is what separates
  // oats from grass.
  float ear = smoothstep(0.52, 0.68, t) * (1.0 - smoothstep(0.9, 1.0, t));
  float halfWidth = uWidth * ((1.0 - 0.74 * t) + ear * 2.3) * 0.5;

  // The blade curves: displacement grows with t squared, so the root stays put.
  // The tip also nods over — an oat panicle is heavy and droops, and that nod
  // is most of what stops a field of these reading as grass.
  float nod = droop * t * t * t;
  vec2 pos;
  pos.x = baseX + bend * t * t + sign(lean + 0.001) * nod * bladeH * 0.42 + side * halfWidth;
  pos.y = baseY - bladeH * t * (1.0 - nod * 0.55);

  vGrowth = growth;
  vEar = ear;

  gl_Position = vec4(
    pos.x / uResolution.x * 2.0 - 1.0,
    1.0 - pos.y / uResolution.y * 2.0,
    0.0,
    1.0
  );
}
`;

export const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in float vGrowth;
in float vEar;

uniform vec3  uColor;
uniform float uAlpha;      // this band's target opacity
uniform float uSolidity;   // 0 = dissolved into grain, 1 = solid

out vec4 fragColor;
${BAYER}

void main() {
  float threshold = bayerThreshold();

  // Coverage is a pure depth cue: distant blades survive on few pixels and read
  // as grain, near blades are almost solid. Dividing the target opacity back out
  // means density changes the *texture* without changing how bright the band
  // is — so the field keeps its §9.8 alpha ceiling however grainy it gets.
  float coverage = mix(0.2, 0.95, uSolidity);
  if (coverage < threshold) discard;

  float alpha = clamp(uAlpha * vGrowth / coverage, 0.0, 1.0) * (1.0 + 0.35 * vEar);
  alpha = clamp(alpha, 0.0, 1.0);

  // Premultiplied, to match the default context and the ONE / ONE_MINUS_SRC_ALPHA
  // blend the renderer sets. Straight alpha here produces edge halos.
  fragColor = vec4(uColor * alpha, alpha);
}
`;
