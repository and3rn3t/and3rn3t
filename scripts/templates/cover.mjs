/**
 * Generated covers for projects that have no screenshot.
 *
 * Each cover is a field of flow lines, the same motif as the hero, seeded by the project's name:
 * the same name always draws the same picture, and different names draw different ones. They
 * are written to images/projects/<name>-cover-<light|dark>.svg by scripts/generate-site.mjs.
 *
 * An SVG loaded through <img> can't read the page's CSS variables, so there is one file per
 * theme and the page shows the right one (see .shot in styles/home.css). The colours below
 * are the --surface-sunken and --accent tokens from styles/core.css.
 */

const WIDTH = 1200;
const HEIGHT = 750;

const PALETTE = {
  light: { background: '#f2f3ee', line: '#15803d' },
  dark: { background: '#0f120f', line: '#4ade80' },
};

const LINES = 44;
const STEPS = 30;
const STEP_LENGTH = 15;

/** A small seeded random generator (mulberry32). */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a: a name becomes a seed. */
function hash(text) {
  let h = 0x811c9dc5;
  for (const char of text) {
    h ^= char.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Both themes draw the same lines: the geometry depends only on the name.
 * @param {string} name
 * @returns {{ d: string, width: number, opacity: number }[]}
 */
function flowLines(name) {
  const random = seeded(hash(name));
  // A smooth angle field: two sine waves with a seeded frequency and phase each
  const [fx, fy] = [0.0025 + random() * 0.004, 0.0025 + random() * 0.004];
  const [px, py] = [random() * Math.PI * 2, random() * Math.PI * 2];
  const swirl = 1.6 + random() * 1.6;
  const drift = random() * Math.PI * 2;
  const angleAt = (x, y) => Math.sin(x * fx + px) * swirl + Math.cos(y * fy + py) * swirl + drift;

  return Array.from({ length: LINES }, () => {
    let x = random() * WIDTH;
    let y = random() * HEIGHT;
    let d = `M${Math.round(x)} ${Math.round(y)}`;
    for (let step = 0; step < STEPS; step++) {
      const angle = angleAt(x, y);
      x += Math.cos(angle) * STEP_LENGTH;
      y += Math.sin(angle) * STEP_LENGTH;
      d += `L${Math.round(x)} ${Math.round(y)}`;
    }
    return {
      d,
      width: Math.round((1 + random() * 1.6) * 10) / 10,
      opacity: Math.round((0.18 + random() * 0.55) * 100) / 100,
    };
  });
}

/**
 * @param {string} name - the project's name (seeds the drawing)
 * @param {'light' | 'dark'} scheme
 * @returns {string} an SVG document
 */
export function renderCover(name, scheme) {
  const { background, line } = PALETTE[scheme];
  const paths = flowLines(name)
    .map(
      ({ d, width, opacity }) =>
        `<path d="${d}" stroke-width="${width}" stroke-opacity="${opacity}"/>`
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" aria-hidden="true">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${background}"/>` +
    `<g fill="none" stroke="${line}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>` +
    `</svg>\n`
  );
}
