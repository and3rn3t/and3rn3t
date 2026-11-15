/**
 * The site's mark, "pulse A": the letter A drawn as a spike on a signal line, with the crossbar
 * as the one accent. Pure functions that return SVG strings; scripts/build-brand.mjs writes them
 * to favicon.svg and icons/, and rasterizes the PNGs.
 *
 * Everything is drawn in a 64×64 box. Two cuts of the same letter:
 *   regular  for 48px and up
 *   heavy    for favicons (32px and under): thicker strokes, drawn closer to the edge
 */

const BOX = 64;
const TILE_RADIUS = 14;

/** Tile and mark colours. `site` and `light` are the dark and light tokens in styles/core.css. */
export const PALETTES = {
  // --surface, --text, --accent (dark)
  site: { tile: '#0b0d0b', mark: '#eef1ee', accent: '#4ade80' },
  // --surface, --text, --accent (light)
  light: { tile: '#fbfbf8', mark: '#15181a', accent: '#15803d' },
  // --accent as the tile, --accent-contrast as the mark: the machine-facing endpoints (MCP, skill)
  agent: { tile: '#4ade80', mark: '#052e16', accent: '#052e16' },
};

const CUTS = {
  regular: {
    trace: 'M8 48H18.5L32 15L45.5 48H56',
    bar: 'M27 37.5H37',
    stroke: 6.5,
    barStroke: 6.5,
  },
  heavy: { trace: 'M6 49H17L32 13L47 49H58', bar: 'M27.5 37H36.5', stroke: 8.5, barStroke: 7.5 },
};

/**
 * The two strokes of the letter, with no tile behind them.
 * @param {{ cut?: 'regular' | 'heavy', mark: string, accent: string }} options
 * @returns {string} SVG markup
 */
export function markPaths({ cut = 'regular', mark, accent }) {
  const { trace, bar, stroke, barStroke } = CUTS[cut];
  return [
    `<path d="${trace}" fill="none" stroke="${mark}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${bar}" fill="none" stroke="${accent}" stroke-width="${barStroke}" stroke-linecap="round"/>`,
  ].join('\n  ');
}

/**
 * The mark on a tile.
 * @param {object} options
 * @param {keyof typeof PALETTES} options.palette
 * @param {'regular' | 'heavy'} [options.cut]
 * @param {'rounded' | 'square'} [options.shape] square is full-bleed, for icons the platform crops
 * @param {number} [options.scale] shrinks the mark about the centre (a maskable icon's safe zone)
 * @param {number} [options.size] pixel size to rasterize at; omitted, the SVG scales freely
 * @param {string} [options.title] accessible name
 * @returns {string} a complete SVG document
 */
export function renderIcon({
  palette,
  cut = 'regular',
  shape = 'rounded',
  scale = 1,
  size,
  title,
}) {
  const colours = PALETTES[palette];
  const radius = shape === 'rounded' ? ` rx="${TILE_RADIUS}"` : '';
  const offset = (BOX * (1 - scale)) / 2;
  const paths = markPaths({ cut, ...colours });
  const mark =
    scale === 1
      ? paths
      : `<g transform="translate(${offset} ${offset}) scale(${scale})">\n  ${paths}\n  </g>`;
  const dimensions = size ? ` width="${size}" height="${size}"` : '';
  const name = title ? `\n  <title>${title}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}"${dimensions}>${name}
  <rect width="${BOX}" height="${BOX}"${radius} fill="${colours.tile}"/>
  ${mark}
</svg>
`;
}

/**
 * The mark alone in one colour, which it takes from the text around it.
 * @returns {string} a complete SVG document
 */
export function renderMonoMark() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">
  <title>andernet.dev</title>
  ${markPaths({ mark: 'currentColor', accent: 'currentColor' })}
</svg>
`;
}

/** The SVG files the site ships: path from the repo root → contents. */
export const SVG_FILES = {
  'favicon.svg': renderIcon({ palette: 'site', cut: 'heavy' }),
  'icons/icon.svg': renderIcon({ palette: 'site' }),
  'icons/agent.svg': renderIcon({ palette: 'agent', title: "Matthew Anderson's portfolio" }),
  'icons/mark.svg': renderMonoMark(),
};

/** The PNG files the site ships: path from the repo root → the icon to rasterize. */
export const PNG_FILES = {
  'icons/icon-192x192.png': { palette: 'site', size: 192 },
  'icons/icon-512x512.png': { palette: 'site', size: 512 },
  // Android crops a maskable icon to its own shape; the mark stays inside the central 80%
  'icons/icon-maskable-512x512.png': { palette: 'site', shape: 'square', scale: 0.72, size: 512 },
  // iOS rounds the corners itself and wants no transparency
  'icons/apple-touch-icon.png': { palette: 'site', shape: 'square', scale: 0.86, size: 180 },
  'icons/agent-512.png': { palette: 'agent', size: 512 },
};
