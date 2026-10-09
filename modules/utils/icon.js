/**
 * Inline SVG icons from the sprite built by scripts/build-icons.mjs.
 */

export const SPRITE_URL = '/icons/sprite.svg';

/**
 * Markup for one sprite icon. Decorative by default (aria-hidden).
 *
 * @param {string} name - Symbol id in icons/sprite.svg (e.g. 'star')
 * @param {string} [extraClass] - Additional classes, e.g. 'icon-spin'
 * @returns {string} SVG markup for innerHTML
 */
export function icon(name, extraClass = '') {
    const id = String(name).replace(/[^a-z0-9-]/gi, '');
    const cls = extraClass ? `icon ${extraClass}` : 'icon';
    return `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="${SPRITE_URL}#${id}"></use></svg>`;
}
