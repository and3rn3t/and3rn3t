/**
 * Hero flow field on the GPU (WebGPU), an opt-in experiment next to the WASM one
 * (modules/wasm/hero-sim.js): `?hero=gpu`. It is the same field: the AssemblyScript step
 * (assembly/hero-sim.ts) ported to a WGSL compute shader, the same value-noise warp, pointer pull
 * and wrapping, and the same look (a trail that fades, thin strokes in the accent colour, added up
 * on dark backgrounds). What changes is who does the work: the particles never leave the GPU, so
 * the cost of a frame stops depending on how many there are, until the GPU itself runs out.
 *
 * Loaded only on request, only where `navigator.gpu` exists. `mountHeroGpu` resolves null, without
 * touching the canvas, when WebGPU cannot be used (no adapter, no device, a shader that does not
 * compile), so the caller falls back to the WASM field on the same canvas. A canvas can only have
 * one kind of context, so once the WebGPU context is taken there is no way back to 2D: the context
 * is the last thing set up.
 */

import { whileVisible } from './utils/while-visible.js';
import { needsReseed } from './wasm/hero-sim.js';
import { seedLayout, seededRandom } from './utils/hero-seed.js';

const FALLBACK_RGB = '21, 128, 61'; // #15803d, when the canvas's colour cannot be read
const WORKGROUP = 64;
/** How far past SDR white the brightest overlaps go on an HDR display (1 is white). */
const HDR_HEADROOM = 2;
const HDR_CONFIG = { format: 'rgba16float', toneMapping: { mode: 'extended' } };
/** About how many particles the stroke opacity (0.7 dark, 0.55 light) was tuned for. */
const TUNED_COUNT = 2500;
/** Floats per particle: x, y, previous x, previous y. */
const STRIDE = 4;

// The flow field: a line-for-line port of assembly/hero-sim.ts (fract is x - floor(x), as there).
const FIELD = /* wgsl */ `
struct Params {
  size: vec2f,
  time: f32,
  speed: f32,
  pointer: vec3f, // x and y in -1..1, then the strength
  count: u32,
  offset: vec2f, // where the seed puts the noise field (0, 0 is the default)
}
struct Particle { pos: vec2f, prev: vec2f }

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

fn hash(x: f32, y: f32) -> f32 {
  var px = x * 123.34;
  var py = y * 456.21;
  px = px - floor(px);
  py = py - floor(py);
  let d = px * (px + 45.32) + py * (py + 45.32);
  let v = (px + d) * (py + d);
  return v - floor(v);
}

fn smoothT(t: f32) -> f32 { return t * t * (3.0 - 2.0 * t); }

fn noise(x: f32, y: f32) -> f32 {
  let ix = floor(x);
  let iy = floor(y);
  let ux = smoothT(x - ix);
  let uy = smoothT(y - iy);
  let a = hash(ix, iy);
  let b = hash(ix + 1.0, iy);
  let c = hash(ix, iy + 1.0);
  let d = hash(ix + 1.0, iy + 1.0);
  let ab = a + (b - a) * ux;
  let cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

fn fbm(x: f32, y: f32) -> f32 {
  var v = 0.0;
  var amp = 0.5;
  var px = x;
  var py = y;
  for (var i = 0; i < 4; i++) {
    v += amp * noise(px, py);
    px *= 2.0;
    py *= 2.0;
    amp *= 0.5;
  }
  return v;
}

@compute @workgroup_size(${WORKGROUP})
fn step(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= params.count) { return; }
  let w = params.size.x;
  let h = params.size.y;
  let inv = 1.0 / min(w, h);
  let t = params.time * 0.08;
  let TAU = 6.2831853;

  var p = particles[i];
  let nx = p.pos.x * inv * 2.2 + params.offset.x;
  let ny = p.pos.y * inv * 2.2 + params.offset.y;
  let wx = fbm(nx + t, ny - t);
  let wy = fbm(nx + 5.2 - t, ny + 1.3 + t);
  let angle = fbm(nx + 2.0 * wx, ny + 2.0 * wy) * TAU * 2.0;
  var v = vec2f(cos(angle), sin(angle)) * params.speed;

  if (params.pointer.z > 0.0) {
    let focus = vec2f(params.pointer.x * 0.5 + 0.5, params.pointer.y * 0.5 + 0.5) * params.size;
    let d = focus - p.pos;
    let dist = length(d) + 0.0001;
    v += d * (params.pointer.z * params.speed * 1.5 / dist);
  }

  var next = p.pos + v;
  // Past an edge, come back in on the other side and start the trail there, so no line spans the field
  var wrapped = false;
  if (next.x < 0.0) { next.x += w; wrapped = true; } else if (next.x >= w) { next.x -= w; wrapped = true; }
  if (next.y < 0.0) { next.y += h; wrapped = true; } else if (next.y >= h) { next.y -= h; wrapped = true; }

  p.prev = select(p.pos, next, wrapped);
  p.pos = next;
  particles[i] = p;
}
`;

const DRAW = /* wgsl */ `
struct Params {
  size: vec2f,
  time: f32,
  speed: f32,
  pointer: vec3f,
  count: u32,
  offset: vec2f,
}
struct Particle { pos: vec2f, prev: vec2f }
struct Look { color: vec4f, fade: f32 }

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;
@group(0) @binding(2) var<uniform> look: Look;

// One line per particle: two vertices, the previous position and the current one
@vertex
fn lineVertex(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let p = particles[vi / 2u];
  let at = select(p.prev, p.pos, (vi & 1u) == 1u);
  return vec4f(at.x / params.size.x * 2.0 - 1.0, 1.0 - at.y / params.size.y * 2.0, 0.0, 1.0);
}

@fragment
fn lineFragment() -> @location(0) vec4f {
  return look.color; // premultiplied
}

// A triangle that covers the whole target
fn corner(vi: u32) -> vec4f {
  let xy = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
}

@vertex
fn fullVertex(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f { return corner(vi); }

// Fades what is already there: the blend multiplies it by (1 - alpha)
@fragment
fn fadeFragment() -> @location(0) vec4f { return vec4f(0.0, 0.0, 0.0, look.fade); }

@group(0) @binding(3) var trail: texture_2d<f32>;

// How far past SDR white the brightest overlaps may go. 1 on an ordinary display, so the boost is
// then exactly 1; HDR_HEADROOM on a display that can show more (see mountHeroGpu's \`hdr\` option)
override headroom: f32 = 1.0;

@fragment
fn presentFragment(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let c = textureLoad(trail, vec2i(pos.xy), 0);
  let peak = max(c.r, max(c.g, c.b));
  let boost = 1.0 + (headroom - 1.0) * smoothstep(0.3, 1.0, peak);
  return vec4f(c.rgb * boost, c.a);
}
`;

/**
 * The canvas's CSS `color` as "r, g, b" (the stylesheet sets it from the accent token).
 * @param {HTMLCanvasElement} canvas
 * @returns {number[]} 0..1
 */
function flowColor(canvas) {
    const match = getComputedStyle(canvas).color.match(/\d+(?:\.\d+)?/g);
    const channels = (
        match && match.length >= 3 ? match.slice(0, 3) : FALLBACK_RGB.split(', ')
    ).map(Number);
    return channels.map(channel => channel / 255);
}

/**
 * Whether a canvas can show what this device draws. Some adapters work for compute and drawing
 * but cannot present: Chromium's software one (SwiftShader, what a CI runner has) answers every
 * canvas's `getCurrentTexture()` with an invalid texture. That only shows at the first frame, when
 * the hero canvas has already given up its 2D context, so it is tried on a canvas of its own first.
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @param {{ mode: 'extended' } | undefined} [toneMapping] - asked for HDR: the browser must confirm it kept it
 * @returns {Promise<boolean>}
 */
async function canPresent(device, format, toneMapping) {
    device.pushErrorScope('validation');
    let threw = false;
    try {
        const probe = document.createElement('canvas');
        probe.width = probe.height = 16;
        const context = probe.getContext('webgpu');
        if (!context) throw new Error('no webgpu context');
        context.configure({ device, format, alphaMode: 'premultiplied', toneMapping });
        // A browser that does not know toneMapping ignores it and clamps to SDR, which is not HDR
        if (toneMapping && context.getConfiguration?.().toneMapping?.mode !== toneMapping.mode) {
            throw new Error('tone mapping not kept');
        }
        const encoder = device.createCommandEncoder();
        encoder
            .beginRenderPass({
                colorAttachments: [
                    {
                        view: context.getCurrentTexture().createView(),
                        clearValue: { r: 0, g: 0, b: 0, a: 0 },
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                ],
            })
            .end();
        device.queue.submit([encoder.finish()]);
        context.unconfigure();
    } catch {
        threw = true;
    }
    const error = await device.popErrorScope();
    return !threw && !error;
}

/**
 * @typedef {Object} HeroGpuHandle
 * @property {() => void} destroy
 * @property {() => { kind: 'gpu', seed: number, hdr: boolean, particles: number, fps: number, frameMs: number }} stats
 */

/**
 * Mount the GPU flow field on a canvas, or resolve null (canvas untouched) when WebGPU cannot be used.
 * @param {HTMLCanvasElement} canvas
 * @param {{ density?: number, speed?: number, reducedMotion?: boolean, trailFade?: number, maxParticles?: number, seed?: number, hdr?: boolean, onLost?: () => void }} [opts]
 * @returns {Promise<HeroGpuHandle | null>}
 */
export async function mountHeroGpu(canvas, opts = {}) {
    if (!globalThis.navigator?.gpu) return null;
    let device;
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return null;
        device = await adapter.requestDevice();
    } catch {
        return null;
    }

    // A validation error would otherwise only reach the console as a browser warning
    device.addEventListener('uncapturederror', event => {
        console.error('[hero-gpu]', event.error?.message ?? event.error);
    });

    let format = navigator.gpu.getPreferredCanvasFormat();
    let trailFormat = 'rgba8unorm';
    // HDR is an experiment on an experiment (`hero-hdr`): only on a display that reports it, and only if
    // a canvas of its own keeps the extended tone mapping. Any doubt means the ordinary SDR field.
    let toneMapping;
    if (
        opts.hdr &&
        globalThis.matchMedia?.('(dynamic-range: high)').matches &&
        (await canPresent(device, HDR_CONFIG.format, HDR_CONFIG.toneMapping))
    ) {
        ({ format, toneMapping } = HDR_CONFIG);
        // Float, so overlapping strokes add past 1 instead of clamping at white
        trailFormat = 'rgba16float';
    }
    if (!toneMapping && !(await canPresent(device, format))) {
        device.destroy();
        return null;
    }
    const hdr = Boolean(toneMapping);
    const reduced = Boolean(opts.reducedMotion);
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const speed = (opts.speed ?? 1.4) * dpr;
    const trailFadeInput = Number(opts.trailFade ?? 0.09);
    const trailFade = Number.isFinite(trailFadeInput)
        ? Math.min(1, Math.max(0, trailFadeInput))
        : 0.09;
    const density = opts.density ?? 0.0009;
    const maxParticles = opts.maxParticles ?? 14000;
    // 0 is the field the site has always drawn; see modules/utils/hero-seed.js
    const heroSeed = opts.seed ?? 0;
    const layout = seedLayout(heroSeed);

    // ── Pipelines (before the canvas is touched: a shader that does not compile means "use WASM") ──
    const additive = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
    const over = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' };
    const fadeBlend = { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha', operation: 'add' };
    // Explicit layouts, not `auto`: the dark and light line pipelines must share one bind group
    const bindLayout = entries => device.createBindGroupLayout({ entries });
    const uniform = (binding, visibility) => ({ binding, visibility, buffer: { type: 'uniform' } });
    const layouts = {
        step: bindLayout([
            uniform(0, GPUShaderStage.COMPUTE),
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        ]),
        draw: bindLayout([
            uniform(0, GPUShaderStage.VERTEX),
            {
                binding: 1,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: 'read-only-storage' },
            },
            uniform(2, GPUShaderStage.FRAGMENT),
        ]),
        fade: bindLayout([uniform(2, GPUShaderStage.FRAGMENT)]),
        present: bindLayout([
            { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        ]),
    };
    const pipelineLayout = layout => device.createPipelineLayout({ bindGroupLayouts: [layout] });
    let pipelines;
    try {
        const field = device.createShaderModule({ code: FIELD });
        const draw = device.createShaderModule({ code: DRAW });
        const lines = blend => ({
            layout: pipelineLayout(layouts.draw),
            vertex: { module: draw, entryPoint: 'lineVertex' },
            fragment: {
                module: draw,
                entryPoint: 'lineFragment',
                targets: [{ format: trailFormat, blend: { color: blend, alpha: blend } }],
            },
            primitive: { topology: 'line-list' },
        });
        const [step, fade, lineDark, lineLight, present] = await Promise.all([
            device.createComputePipelineAsync({
                layout: pipelineLayout(layouts.step),
                compute: { module: field, entryPoint: 'step' },
            }),
            device.createRenderPipelineAsync({
                layout: pipelineLayout(layouts.fade),
                vertex: { module: draw, entryPoint: 'fullVertex' },
                fragment: {
                    module: draw,
                    entryPoint: 'fadeFragment',
                    targets: [
                        { format: trailFormat, blend: { color: fadeBlend, alpha: fadeBlend } },
                    ],
                },
            }),
            device.createRenderPipelineAsync(lines(additive)),
            device.createRenderPipelineAsync(lines(over)),
            device.createRenderPipelineAsync({
                layout: pipelineLayout(layouts.present),
                vertex: { module: draw, entryPoint: 'fullVertex' },
                fragment: {
                    module: draw,
                    entryPoint: 'presentFragment',
                    constants: { headroom: hdr ? HDR_HEADROOM : 1 },
                    targets: [{ format }],
                },
            }),
        ]);
        pipelines = { step, fade, lineDark, lineLight, present };
    } catch {
        device.destroy();
        return null;
    }

    // The WebGPU context is taken here and cannot be given back: nothing after this may return null
    const context = canvas.getContext('webgpu');
    if (!context) {
        device.destroy();
        return null;
    }
    context.configure({ device, format, alphaMode: 'premultiplied', toneMapping });

    // ── State ────────────────────────────────────────────────────────────────────────────────────
    const paramsBuffer = device.createBuffer({
        size: 48,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const lookBuffer = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const params = new Float32Array(12);
    const paramsCount = new Uint32Array(params.buffer);
    const look = new Float32Array(8);

    let width = 0;
    let height = 0;
    let count = 0;
    let particleBuffer = null;
    let trailTexture = null;
    let stepGroup = null;
    let drawGroup = null;
    let fadeGroup = null;
    let presentGroup = null;

    function isDark() {
        return document.documentElement.dataset.theme === 'dark';
    }

    function writeLook() {
        // Dark backgrounds take additive strokes; on paper they would wash out, so draw normally.
        // More particles means more lines piled on the same pixels, which adds up to white and runs
        // through the headline, so past the density the field was tuned at, each stroke gets fainter
        const alpha = (isDark() ? 0.7 : 0.55) * Math.min(1, Math.sqrt(TUNED_COUNT / count));
        const [r, g, b] = flowColor(canvas);
        look.set([r * alpha, g * alpha, b * alpha, alpha, trailFade]);
        device.queue.writeBuffer(lookBuffer, 0, look);
    }

    function sizeAndSeed() {
        const cssW = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
        const cssH = canvas.clientHeight || canvas.parentElement?.clientHeight || 400;
        width = Math.max(1, Math.floor(cssW * dpr));
        height = Math.max(1, Math.floor(cssH * dpr));
        canvas.width = width;
        canvas.height = height;

        count = Math.max(800, Math.min(maxParticles, Math.round(width * height * density)));
        const random = seededRandom(heroSeed);
        const seed = new Float32Array(count * STRIDE);
        for (let i = 0; i < count; i++) {
            const x = random() * width;
            const y = random() * height;
            seed.set([x, y, x, y], i * STRIDE);
        }
        particleBuffer?.destroy();
        particleBuffer = device.createBuffer({
            size: seed.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(particleBuffer, 0, seed);

        trailTexture?.destroy();
        trailTexture = device.createTexture({
            size: [width, height],
            format: trailFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });

        paramsCount[7] = count;
        params[0] = width;
        params[1] = height;
        params[8] = layout.x;
        params[9] = layout.y;
        device.queue.writeBuffer(paramsBuffer, 0, params);

        const common = [
            { binding: 0, resource: { buffer: paramsBuffer } },
            { binding: 1, resource: { buffer: particleBuffer } },
        ];
        stepGroup = device.createBindGroup({
            layout: layouts.step,
            entries: common,
        });
        const lookEntry = { binding: 2, resource: { buffer: lookBuffer } };
        drawGroup = device.createBindGroup({
            layout: layouts.draw,
            entries: [...common, lookEntry],
        });
        fadeGroup = device.createBindGroup({
            layout: layouts.fade,
            entries: [lookEntry],
        });
        presentGroup = device.createBindGroup({
            layout: layouts.present,
            entries: [{ binding: 3, resource: trailTexture.createView() }],
        });
        writeLook();
    }

    sizeAndSeed();

    // ── Pointer, as in the WASM field ────────────────────────────────────────────────────────────
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, strength: 0 };
    function onPointerMove(event) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        pointer.tx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.ty = ((event.clientY - rect.top) / rect.height) * 2 - 1;
        pointer.strength = 1;
    }
    globalThis.addEventListener('pointermove', onPointerMove, { passive: true });

    const onThemeChange = () => writeLook();
    document.addEventListener('themeChanged', onThemeChange);

    // ── Frames ───────────────────────────────────────────────────────────────────────────────────
    let raf = 0;
    let running = false;
    let destroyed = false;
    let startTime = performance.now();
    const frameTimes = [];
    let lastFrameMs = 0;

    function frame(now) {
        if (destroyed) return;
        const elapsed = (now - startTime) / 1000;
        frameTimes.push(now);
        if (frameTimes.length > 60) frameTimes.shift();

        pointer.x += (pointer.tx - pointer.x) * 0.05;
        pointer.y += (pointer.ty - pointer.y) * 0.05;
        pointer.strength *= 0.96;
        params[2] = elapsed;
        params[3] = speed;
        params[4] = pointer.x;
        params[5] = pointer.y;
        params[6] = pointer.strength;
        device.queue.writeBuffer(paramsBuffer, 0, params);

        const encoder = device.createCommandEncoder();
        const compute = encoder.beginComputePass();
        compute.setPipeline(pipelines.step);
        compute.setBindGroup(0, stepGroup);
        compute.dispatchWorkgroups(Math.ceil(count / WORKGROUP));
        compute.end();

        // Fade the trail, then add this step's lines to it
        const trail = encoder.beginRenderPass({
            colorAttachments: [
                { view: trailTexture.createView(), loadOp: 'load', storeOp: 'store' },
            ],
        });
        trail.setPipeline(pipelines.fade);
        trail.setBindGroup(0, fadeGroup);
        trail.draw(3);
        trail.setPipeline(isDark() ? pipelines.lineDark : pipelines.lineLight);
        trail.setBindGroup(0, drawGroup);
        trail.draw(count * 2);
        trail.end();

        // Put the trail on the canvas (transparent where nothing is drawn)
        const out = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        });
        out.setPipeline(pipelines.present);
        out.setBindGroup(0, presentGroup);
        out.draw(3);
        out.end();

        const submitted = performance.now();
        device.queue.submit([encoder.finish()]);
        device.queue.onSubmittedWorkDone().then(() => {
            lastFrameMs = performance.now() - submitted;
        });

        if (running && !reduced) raf = requestAnimationFrame(frame);
    }

    function start() {
        if (running) return;
        running = true;
        startTime = performance.now();
        raf = requestAnimationFrame(frame);
        if (reduced) running = false; // one still frame
    }
    function stop() {
        running = false;
        cancelAnimationFrame(raf);
    }
    const unobserve = whileVisible(canvas, start, stop);

    let resizeTimer = 0;
    function onResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const cssW = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
            const cssH = canvas.clientHeight || canvas.parentElement?.clientHeight || 400;
            if (needsReseed({ width, height }, { width: cssW * dpr, height: cssH * dpr })) {
                sizeAndSeed();
            }
        }, 150);
    }
    globalThis.addEventListener('resize', onResize, { passive: true });

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        stop();
        unobserve();
        globalThis.removeEventListener('pointermove', onPointerMove);
        globalThis.removeEventListener('resize', onResize);
        document.removeEventListener('themeChanged', onThemeChange);
        clearTimeout(resizeTimer);
        device.destroy();
    }

    // A lost device (a GPU reset, the driver being updated) cannot be recovered on this canvas:
    // stop, and let the page show its CSS fallback
    device.lost.then(info => {
        if (destroyed) return;
        destroy();
        opts.onLost?.(info);
    });

    start();

    return {
        destroy,
        stats() {
            const span = frameTimes.at(-1) - frameTimes[0];
            return {
                kind: 'gpu',
                seed: heroSeed,
                hdr,
                particles: count,
                fps:
                    frameTimes.length > 1 ? Math.round(((frameTimes.length - 1) / span) * 1000) : 0,
                frameMs: Math.round(lastFrameMs * 100) / 100,
            };
        },
    };
}
