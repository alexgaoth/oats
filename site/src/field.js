// The film's stage behind the app window (demo/video/src/brand/Fluid.tsx): light
// grey that moves slowly, like smoke in still air. Domain-warped noise, spanning
// a dozen grey levels around #f3f3f3, with an ordered (Bayer) dither so the
// shallow ramp never bands. The film works it out on the CPU, frame by frame;
// here a fragment shader draws the same field live, at most 30 times a second,
// only while it is on screen, and once only under prefers-reduced-motion.

const VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 size;
uniform float time;
uniform float scale;

float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value / 0.9375;
}

float bayer(vec2 pixel) {
  vec2 q = mod(floor(pixel), 4.0);
  float i = q.y * 4.0 + q.x;
  float m[16];
  m[0] = 0.0; m[1] = 8.0; m[2] = 2.0; m[3] = 10.0;
  m[4] = 12.0; m[5] = 4.0; m[6] = 14.0; m[7] = 6.0;
  m[8] = 3.0; m[9] = 11.0; m[10] = 1.0; m[11] = 9.0;
  m[12] = 15.0; m[13] = 7.0; m[14] = 13.0; m[15] = 5.0;
  float v = 0.0;
  for (int k = 0; k < 16; k++) { if (float(k) == i) v = m[k]; }
  return (v + 0.5) / 16.0 - 0.5;
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
  vec2 p = pixel / scale;
  float t = time;
  float qx = fbm(p + vec2(0.07 * t, -0.05 * t));
  float qy = fbm(p + vec2(5.2 - 0.04 * t, 1.3 + 0.06 * t));
  float value = fbm(p + 1.8 * vec2(qx, qy) + vec2(0.03 * t, -0.02 * t));
  float grey = 243.0 + 7.0 * (value * 2.0 - 1.0) + bayer(gl_FragCoord.xy);
  float level = clamp(floor(grey + 0.5), 0.0, 255.0) / 255.0;
  gl_FragColor = vec4(vec3(level), 1.0);
}
`;

/** One unit of the noise, in CSS pixels: the size of a fold, as in the film. */
const FOLD = 640;
const FRAME_MS = 1000 / 30;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

/** Draws the field into `canvas`, which CSS sizes; returns false without WebGL. */
export function mountField(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) return false;
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) {
    console.warn("field:", error);
    return false;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uSize = gl.getUniformLocation(program, "size");
  const uTime = gl.getUniformLocation(program, "time");
  const uScale = gl.getUniformLocation(program, "scale");

  // One canvas pixel per CSS pixel: the field is a dozen grey levels, and the
  // dither needs no more than that to stay smooth.
  let ratio = 1;
  function fit() {
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      draw(clock());
    }
  }

  // The film's clock, continued from the page's own start, so the field does
  // not jump between frames or when it comes back on screen.
  const started = performance.now();
  const clock = () => (performance.now() - started) / 1000 + 40;

  function draw(seconds) {
    gl.uniform2f(uSize, canvas.width, canvas.height);
    gl.uniform1f(uTime, seconds);
    gl.uniform1f(uScale, FOLD * ratio);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let visible = false;
  let raf = 0;
  let last = 0;
  function loop(now) {
    raf = 0;
    if (!visible || document.hidden || still?.matches) return;
    if (now - last >= FRAME_MS) {
      last = now;
      draw(clock());
    }
    raf = requestAnimationFrame(loop);
  }
  function wake() {
    if (!raf && visible && !document.hidden && !still?.matches) raf = requestAnimationFrame(loop);
  }

  fit();
  new ResizeObserver(fit).observe(canvas);
  new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    wake();
  }).observe(canvas);
  document.addEventListener("visibilitychange", wake);
  still?.addEventListener?.("change", () => {
    draw(clock());
    wake();
  });
  canvas.classList.add("is-live");
  return true;
}
