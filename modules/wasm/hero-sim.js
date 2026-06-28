/**
 * Hero WASM flow-field adapter.
 *
 * Thin JS host around the AssemblyScript `hero-core` module. WASM owns the
 * particle physics in linear memory; JS just reads the shared Float32 buffer
 * each frame and paints motion-trail segments to a 2D canvas. This is the
 * "thin JS shell + WASM compute core" architecture from the plan.
 *
 * Loads lazily and only when called, so it never affects first paint. Honors
 * reduced-motion and exposes a live FPS sample for measurement.
 */

const GREEN_LIGHT = '34, 197, 94'; // #22c55e
const GREEN_DARK = '74, 222, 128'; // #4ade80

// Resolve the wasm asset relative to this module. `new URL(..., import.meta.url)`
// is the Vite-recommended form (emits the wasm as a build asset) and also works
// when GitHub Pages serves raw source. Manual instantiation avoids the top-level
// await in AssemblyScript's generated ESM glue, which the es2020 build rejects.
const WASM_URL = new URL('./hero-core.wasm', import.meta.url);

/**
 * Fetch + instantiate the WASM core. The only import the module needs is
 * `env.abort`; everything else is numeric exports over shared linear memory.
 * @returns {Promise<{ memory: WebAssembly.Memory, init: Function, resize: Function,
 *   setPointer: Function, step: Function, particlePtr: Function,
 *   particleCount: Function, stride: Function }>}
 */
async function loadSim() {
    const imports = {
        env: {
            abort() {
                throw new Error('wasm abort');
            },
        },
    };
    const response = await fetch(WASM_URL);
    const { instance } = await WebAssembly.instantiateStreaming(response.clone(), imports).catch(
        async () => {
            // Some static hosts serve .wasm without the application/wasm MIME type,
            // which breaks streaming. Fall back to ArrayBuffer instantiation.
            const bytes = await response.arrayBuffer();
            return WebAssembly.instantiate(bytes, imports);
        }
    );
    return instance.exports;
}

/**
 * @typedef {Object} HeroSimHandle
 * @property {() => void} destroy
 * @property {() => number} fps      Most recent frames-per-second sample.
 * @property {() => number} particles Particle count in the simulation.
 */

/**
 * Mount the WASM particle field onto a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{ density?: number, speed?: number, reducedMotion?: boolean }} [opts]
 * @returns {Promise<HeroSimHandle | null>}
 */
export async function mountHeroSim(canvas, opts = {}) {
    if (!canvas) {
        return null;
    }

    let sim;
    try {
        sim = await loadSim();
    } catch {
        return null; // WASM unavailable → caller keeps its existing fallback.
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
        return null;
    }

    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const reduced = Boolean(opts.reducedMotion);
    const speed = opts.speed ?? 1.4;
    // Particles scale with area but stay capped so low-power devices stay smooth.
    const density = opts.density ?? 0.0009;

    let width = 0;
    let height = 0;
    let count = 0;
    let stride = 0;
    let view = null; // Float32Array over WASM memory.

    function refreshView() {
        const ptr = sim.particlePtr();
        stride = sim.stride();
        count = sim.particleCount();
        view = new Float32Array(sim.memory.buffer, ptr, count * stride);
    }

    function sizeAndSeed() {
        const cssW = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
        const cssH = canvas.clientHeight || canvas.parentElement?.clientHeight || 400;
        width = Math.max(1, Math.floor(cssW * dpr));
        height = Math.max(1, Math.floor(cssH * dpr));
        canvas.width = width;
        canvas.height = height;

        const target = Math.round(width * height * density);
        const n = Math.max(800, Math.min(14000, target));
        sim.init(n, width, height);
        refreshView();
        ctx.clearRect(0, 0, width, height);
    }

    sizeAndSeed();

    // Pointer easing toward the cursor target (matches hero-canvas feel).
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, strength: 0 };

    function onPointerMove(event) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }
        pointer.tx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.ty = ((event.clientY - rect.top) / rect.height) * 2 - 1;
        pointer.strength = 1;
    }
    globalThis.addEventListener('pointermove', onPointerMove, { passive: true });

    let raf = 0;
    let running = false;
    let startTime = performance.now();
    let lastFrame = startTime;
    let fps = 0;

    function isDark() {
        return document.body.classList.contains('dark-theme');
    }

    function frame(now) {
        const elapsed = (now - startTime) / 1000;
        const dt = now - lastFrame;
        lastFrame = now;
        if (dt > 0) {
            fps += (1000 / dt - fps) * 0.1; // smoothed
        }

        // Ease pointer; decay strength when idle.
        pointer.x += (pointer.tx - pointer.x) * 0.05;
        pointer.y += (pointer.ty - pointer.y) * 0.05;
        pointer.strength *= 0.96;
        sim.setPointer(pointer.x, pointer.y, pointer.strength);

        sim.step(elapsed, speed * dpr);
        if (sim.memory.buffer !== view?.buffer) {
            refreshView(); // memory grew → re-bind the view.
        }

        // Fade previous frame for trails instead of hard clear.
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = isDark() ? 'rgba(3, 6, 5, 0.06)' : 'rgba(255, 255, 255, 0.07)';
        ctx.fillRect(0, 0, width, height);

        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = dpr;
        ctx.strokeStyle = `rgba(${isDark() ? GREEN_DARK : GREEN_LIGHT}, 0.85)`;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
            const b = i * stride;
            const x = view[b];
            const y = view[b + 1];
            const px = view[b + 2];
            const py = view[b + 3];
            ctx.moveTo(px, py);
            ctx.lineTo(x, y);
        }
        ctx.stroke();

        if (running && !reduced) {
            raf = requestAnimationFrame(frame);
        }
    }

    function start() {
        if (running) {
            return;
        }
        running = true;
        startTime = performance.now();
        lastFrame = startTime;
        raf = requestAnimationFrame(frame);
        if (reduced) {
            running = false; // single static frame only
        }
    }

    function stop() {
        running = false;
        cancelAnimationFrame(raf);
    }

    const io = new IntersectionObserver(
        entries => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    start();
                } else {
                    stop();
                }
            }
        },
        { threshold: 0.01 }
    );
    io.observe(canvas);

    function onVisibility() {
        if (document.hidden) {
            stop();
        } else {
            start();
        }
    }
    document.addEventListener('visibilitychange', onVisibility);

    let resizeTimer = 0;
    function onResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(sizeAndSeed, 150);
    }
    globalThis.addEventListener('resize', onResize, { passive: true });

    start();

    return {
        destroy() {
            stop();
            io.disconnect();
            document.removeEventListener('visibilitychange', onVisibility);
            globalThis.removeEventListener('pointermove', onPointerMove);
            globalThis.removeEventListener('resize', onResize);
            clearTimeout(resizeTimer);
        },
        fps: () => Math.round(fps),
        particles: () => count,
    };
}
