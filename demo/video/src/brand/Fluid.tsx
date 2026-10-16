import React, { useLayoutEffect, useRef } from "react";
import { useVideoConfig } from "remotion";
import { useFilmFrame } from "./filmClock";

/**
 * The stage behind the window: light grey that moves slowly, like smoke in
 * still air (Alex: "obscure grey fluid movements"). Plain white read as
 * flat; a warm gradient read as decoration.
 *
 * A field of domain-warped noise, worked out on a grid of 8 px cells and
 * spread over the frame bilinearly. It spans only a dozen grey levels, and a
 * smooth ramp that shallow bands in 8-bit video, so each pixel takes an
 * ordered (Bayer) dither before it is rounded: the app's own way with fills.
 * Driven by the film's frame, so it flows on through every dissolve.
 */
const CELL = 8;
const BASE = 243; // about #f3f3f3, near hillclimb.com's #f5f5f5
const SPREAD = 7; // grey levels either side of the base
/** One unit of the noise field, in film pixels: the size of a fold. */
const SCALE = 640;

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

function hash(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    value += amplitude * noise(x * frequency, y * frequency);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return value / 0.9375;
}

/** The field's value (0..1) at a point of the frame, at time t (seconds). */
function field(x: number, y: number, t: number): number {
  const px = x / SCALE;
  const py = y / SCALE;
  const qx = fbm(px + 0.07 * t, py - 0.05 * t);
  const qy = fbm(px + 5.2 - 0.04 * t, py + 1.3 + 0.06 * t);
  return fbm(px + 1.8 * qx + 0.03 * t, py + 1.8 * qy - 0.02 * t);
}

export const Fluid: React.FC = () => {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const frame = useFilmFrame();
  const { width, height, fps } = useVideoConfig();
  useLayoutEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const t = frame / fps;
    const cols = Math.ceil(width / CELL) + 2;
    const rows = Math.ceil(height / CELL) + 2;
    const grid = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        grid[j * cols + i] = field(i * CELL, j * CELL, t);
      }
    }
    const image = context.createImageData(width, height);
    const data = image.data;
    for (let y = 0; y < height; y += 1) {
      const gy = y / CELL;
      const j = Math.floor(gy);
      const v = gy - j;
      const row0 = j * cols;
      const row1 = row0 + cols;
      for (let x = 0; x < width; x += 1) {
        const gx = x / CELL;
        const i = Math.floor(gx);
        const u = gx - i;
        const top = grid[row0 + i] + (grid[row0 + i + 1] - grid[row0 + i]) * u;
        const bottom = grid[row1 + i] + (grid[row1 + i + 1] - grid[row1 + i]) * u;
        const value = top + (bottom - top) * v;
        const grey = BASE + SPREAD * (value * 2 - 1) + BAYER4[((y & 3) << 2) | (x & 3)];
        const level = Math.max(0, Math.min(255, Math.round(grey)));
        const k = (y * width + x) * 4;
        data[k] = level;
        data[k + 1] = level;
        data[k + 2] = level;
        data[k + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }, [frame, fps, width, height]);
  return <canvas ref={canvas} width={width} height={height} style={{ position: "absolute", inset: 0, width, height }} />;
};
