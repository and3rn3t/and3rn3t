/**
 * Helpers shared by the page templates in this folder and by scripts/generate-site.mjs.
 */

export const READING_SPEED_WPM = 200;

/**
 * Reading time for a post: the curated figure when there is one, otherwise an estimate
 * from the word count of its HTML.
 * @param {{ readingMinutes?: number, content: string }} post
 * @returns {number}
 */
export const minutes = post =>
  post.readingMinutes ??
  Math.max(
    1,
    Math.round(
      post.content
        .replace(/<[^>]*>/g, ' ')
        .trim()
        .split(/\s+/).length / READING_SPEED_WPM
    )
  );

/**
 * "July 12, 2026" from a "2026-07-12" date. Parsed and printed in UTC so the result doesn't
 * depend on the machine's time zone.
 * @param {string} dateStr
 * @returns {string}
 */
export const longDate = dateStr => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

/**
 * "Jul 12, 2026" from a "2026-07-12" date: the compact form for lists. UTC, like longDate.
 * @param {string} dateStr
 * @returns {string}
 */
export const shortDate = dateStr => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};
