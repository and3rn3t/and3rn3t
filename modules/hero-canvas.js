/**
 * Hero Mesh-Gradient Canvas
 *
 * A hand-rolled, dependency-free WebGL animated mesh gradient that lives behind
 * the hero. Flowing domain-warped noise tinted with the site's green palette,
 * with a subtle cursor/gyroscope reaction. Pauses when off-screen or hidden.
 *
 * Degrades gracefully: if WebGL is unavailable or heavy effects are disabled,
 * a static CSS gradient (`.hero-canvas-fallback`) shows instead.
 *
 * @author Matthew Anderson
 */

import { canRunHeavyEffects, supportsWebGL, motion } from './capabilities.js';

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// Domain-warped value noise → soft flowing mesh, tinted with green stops.
const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;   // -1..1, eased
uniform float u_dark;     // 0 = light, 1 = dark

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
        v += amp * noise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = uv;
    p.x *= aspect;

    float t = u_time * 0.05;
    vec2 pointer = u_pointer * 0.15;

    // Domain warp
    vec2 q = vec2(fbm(p + t + pointer), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p + 2.0 * q + vec2(1.7, 9.2) + 0.15 * t),
                  fbm(p + 2.0 * q + vec2(8.3, 2.8) - 0.12 * t));
    float f = fbm(p + 2.0 * r);

    // Green palette stops
    vec3 c1 = vec3(0.086, 0.639, 0.290); // #16a34a
    vec3 c2 = vec3(0.133, 0.773, 0.369); // #22c55e
    vec3 c3 = vec3(0.290, 0.871, 0.502); // #4ade80
    vec3 c4 = vec3(0.078, 0.522, 0.239); // #14803d-ish

    vec3 col = mix(c1, c2, clamp(f * f * 2.0, 0.0, 1.0));
    col = mix(col, c3, clamp(length(q), 0.0, 1.0));
    col = mix(col, c4, clamp(r.x * 0.8, 0.0, 1.0));

    // Light theme: lighten & desaturate toward white for a soft wash.
    vec3 lightCol = mix(vec3(1.0), col, 0.28);
    // Dark theme: deepen toward near-black green.
    vec3 darkCol = mix(vec3(0.03, 0.06, 0.05), col, 0.55);
    col = mix(lightCol, darkCol, u_dark);

    // Subtle vignette
    float d = distance(uv, vec2(0.5));
    col *= 1.0 - d * 0.35;

    gl_FragColor = vec4(col, 1.0);
}`;

/**
 * @typedef {Object} HeroCanvasHandle
 * @property {() => void} destroy
 */

/**
 * Initialise the hero canvas.
 * @param {HTMLCanvasElement} canvas
 * @returns {HeroCanvasHandle | null}
 */
export function initHeroCanvas(canvas) {
    if (!canvas) {
        return null;
    }

    // No WebGL or user opted out → leave the CSS fallback visible.
    if (!supportsWebGL || !canRunHeavyEffects()) {
        canvas.classList.add('is-fallback');
        return null;
    }

    const gl = canvas.getContext('webgl', {
        antialias: false,
        alpha: false,
        depth: false,
        powerPreference: 'low-power'
    });

    if (!gl) {
        canvas.classList.add('is-fallback');
        return null;
    }

    const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    if (!program) {
        canvas.classList.add('is-fallback');
        return null;
    }

    gl.useProgram(program);

    // Full-screen triangle
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const positionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, 'u_resolution');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uPointer = gl.getUniformLocation(program, 'u_pointer');
    const uDark = gl.getUniformLocation(program, 'u_dark');

    // State
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let rafId = 0;
    let running = false;
    let startTime = performance.now();
    let frozenTime = 0; // when reduced motion, render a single static frame

    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);

    function resize() {
        const { clientWidth, clientHeight } = canvas;
        const w = Math.max(1, Math.floor(clientWidth * dpr));
        const h = Math.max(1, Math.floor(clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            gl.viewport(0, 0, w, h);
        }
    }

    function isDark() {
        return document.body.classList.contains('dark-theme') ? 1 : 0;
    }

    function render(now) {
        const elapsed = motion.reduced ? frozenTime : (now - startTime) / 1000;
        // Ease pointer toward target
        pointer.x += (pointer.tx - pointer.x) * 0.05;
        pointer.y += (pointer.ty - pointer.y) * 0.05;

        gl.uniform2f(uResolution, canvas.width, canvas.height);
        gl.uniform1f(uTime, elapsed);
        gl.uniform2f(uPointer, pointer.x, pointer.y);
        gl.uniform1f(uDark, isDark());
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        if (running && !motion.reduced) {
            rafId = requestAnimationFrame(render);
        }
    }

    function start() {
        if (running) {
            return;
        }
        running = true;
        resize();
        startTime = performance.now();
        if (motion.reduced) {
            // Single static frame, no animation loop.
            requestAnimationFrame(render);
            running = false;
        } else {
            rafId = requestAnimationFrame(render);
        }
    }

    function stop() {
        running = false;
        cancelAnimationFrame(rafId);
    }

    // Pause when scrolled away / tab hidden.
    const io = new IntersectionObserver(
        (entries) => {
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

    function onPointerMove(event) {
        const rect = canvas.getBoundingClientRect();
        pointer.tx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.ty = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    }
    globalThis.addEventListener('pointermove', onPointerMove, { passive: true });

    const onResize = () => resize();
    globalThis.addEventListener('resize', onResize, { passive: true });

    start();
    canvas.classList.add('is-active');

    return {
        destroy() {
            stop();
            io.disconnect();
            document.removeEventListener('visibilitychange', onVisibility);
            globalThis.removeEventListener('pointermove', onPointerMove);
            globalThis.removeEventListener('resize', onResize);
            gl.deleteProgram(program);
            gl.deleteBuffer(buffer);
        }
    };
}

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vsSource, fsSource) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) {
        return null;
    }
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program);
        return null;
    }
    return program;
}
