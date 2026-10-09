/**
 * Shared loader for the site's static JSON files. Callers asking for the same path
 * share one request; a failed load is forgotten so a later call can retry.
 */

const inflight = new Map();

/**
 * @param {string} path - Root-relative path, e.g. '/projects-data.json'
 * @returns {Promise<any|null>} Parsed JSON, or null if the file couldn't be loaded
 */
export function loadJSON(path) {
    if (!inflight.has(path)) {
        const request = fetch(path)
            .then(response => (response.ok ? response.json() : null))
            .catch(() => null)
            .then(data => {
                if (data === null) inflight.delete(path);
                return data;
            });
        inflight.set(path, request);
    }
    return inflight.get(path);
}
