// Hero particle flow-field simulation — AssemblyScript → WASM.
//
// Thousands of particles are advected through a domain-warped value-noise flow
// field, fully in WASM linear memory. JS reads the particle buffer each frame
// and draws it. This is the CPU-side numeric work that WASM does well and that
// JS struggles to keep at 60fps with high particle counts.
//
// Memory layout (Float32, contiguous):
//   [x0, y0, px0, py0,  x1, y1, px1, py1, ...]
// where (x, y) is the current position and (px, py) the previous position so JS
// can draw a motion-trail segment per particle.

const STRIDE: i32 = 4; // x, y, prevX, prevY

let particles: Float32Array = new Float32Array(0);
let count: i32 = 0;
let width: f32 = 0;
let height: f32 = 0;

// Pointer eased target (-1..1 range), set from JS.
let pointerX: f32 = 0;
let pointerY: f32 = 0;
let pointerStrength: f32 = 0;

// Deterministic PRNG so the field is reproducible across reloads.
let seed: u32 = 0x9e3779b9;
function rnd(): f32 {
  seed ^= seed << 13;
  seed ^= seed >> 17;
  seed ^= seed << 5;
  return <f32>(seed & 0xffffff) / <f32>0xffffff;
}

// ── Value noise (matches the spirit of the GLSL fbm in hero-canvas.js) ──────
function hash(x: f32, y: f32): f32 {
  let px: f32 = x * 123.34;
  let py: f32 = y * 456.21;
  px = px - Mathf.floor(px);
  py = py - Mathf.floor(py);
  const d: f32 = px * (px + 45.32) + py * (py + 45.32);
  let v: f32 = (px + d) * (py + d);
  v = v - Mathf.floor(v);
  return v;
}

function smooth(t: f32): f32 {
  return t * t * (3.0 - 2.0 * t);
}

function noise(x: f32, y: f32): f32 {
  const ix: f32 = Mathf.floor(x);
  const iy: f32 = Mathf.floor(y);
  const fx: f32 = x - ix;
  const fy: f32 = y - iy;
  const ux: f32 = smooth(fx);
  const uy: f32 = smooth(fy);
  const a: f32 = hash(ix, iy);
  const b: f32 = hash(ix + 1.0, iy);
  const c: f32 = hash(ix, iy + 1.0);
  const d: f32 = hash(ix + 1.0, iy + 1.0);
  const ab: f32 = a + (b - a) * ux;
  const cd: f32 = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

function fbm(x: f32, y: f32): f32 {
  let v: f32 = 0.0;
  let amp: f32 = 0.5;
  let px: f32 = x;
  let py: f32 = y;
  for (let i: i32 = 0; i < 4; i++) {
    v += amp * noise(px, py);
    px *= 2.0;
    py *= 2.0;
    amp *= 0.5;
  }
  return v;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Allocate `n` particles for a `w` x `h` field and scatter them randomly. */
export function init(n: i32, w: f32, h: f32): void {
  count = n;
  width = w;
  height = h;
  particles = new Float32Array(n * STRIDE);
  for (let i: i32 = 0; i < n; i++) {
    const base: i32 = i * STRIDE;
    const x: f32 = rnd() * w;
    const y: f32 = rnd() * h;
    unchecked((particles[base + 0] = x));
    unchecked((particles[base + 1] = y));
    unchecked((particles[base + 2] = x));
    unchecked((particles[base + 3] = y));
  }
}

/** Resize the field bounds without reallocating existing particles. */
export function resize(w: f32, h: f32): void {
  width = w;
  height = h;
}

/** Update the eased pointer influence (range -1..1) and its strength 0..1. */
export function setPointer(px: f32, py: f32, strength: f32): void {
  pointerX = px;
  pointerY = py;
  pointerStrength = strength;
}

/**
 * Advance the simulation one step.
 * @param time   Seconds since start (animates the flow field).
 * @param speed  Per-step velocity scale in pixels.
 */
export function step(time: f32, speed: f32): void {
  const w: f32 = width;
  const h: f32 = height;
  if (w <= 0.0 || h <= 0.0 || count == 0) return;

  const inv: f32 = 1.0 / (w < h ? w : h);
  const t: f32 = time * 0.08;
  const TAU: f32 = 6.2831853;

  // Pointer in pixel space for radial attraction.
  const pcx: f32 = (pointerX * 0.5 + 0.5) * w;
  const pcy: f32 = (pointerY * 0.5 + 0.5) * h;

  for (let i: i32 = 0; i < count; i++) {
    const base: i32 = i * STRIDE;
    const x: f32 = unchecked(particles[base + 0]);
    const y: f32 = unchecked(particles[base + 1]);

    // Domain-warped noise → smooth flow angle.
    const nx: f32 = x * inv * 2.2;
    const ny: f32 = y * inv * 2.2;
    const wx: f32 = fbm(nx + t, ny - t);
    const wy: f32 = fbm(nx + 5.2 - t, ny + 1.3 + t);
    const angle: f32 = fbm(nx + 2.0 * wx, ny + 2.0 * wy) * TAU * 2.0;

    let vx: f32 = Mathf.cos(angle) * speed;
    let vy: f32 = Mathf.sin(angle) * speed;

    // Pointer attraction (eased, capped).
    if (pointerStrength > 0.0) {
      const dx: f32 = pcx - x;
      const dy: f32 = pcy - y;
      const dist: f32 = Mathf.sqrt(dx * dx + dy * dy) + 0.0001;
      const pull: f32 = (pointerStrength * speed * 1.5) / dist;
      vx += dx * pull;
      vy += dy * pull;
    }

    let nxp: f32 = x + vx;
    let nyp: f32 = y + vy;

    // Wrap around edges with a fresh trail anchor so lines don't span the screen.
    let wrapped: bool = false;
    if (nxp < 0.0) {
      nxp += w;
      wrapped = true;
    } else if (nxp >= w) {
      nxp -= w;
      wrapped = true;
    }
    if (nyp < 0.0) {
      nyp += h;
      wrapped = true;
    } else if (nyp >= h) {
      nyp -= h;
      wrapped = true;
    }

    unchecked((particles[base + 2] = wrapped ? nxp : x));
    unchecked((particles[base + 3] = wrapped ? nyp : y));
    unchecked((particles[base + 0] = nxp));
    unchecked((particles[base + 1] = nyp));
  }
}

/** Byte offset of the particle buffer in WASM linear memory. */
export function particlePtr(): usize {
  return particles.dataStart;
}

/** Number of particles currently allocated. */
export function particleCount(): i32 {
  return count;
}

/** Floats per particle (x, y, prevX, prevY). */
export function stride(): i32 {
  return STRIDE;
}
