/**
 * Run `start` while `el` is on screen and the tab is visible, and `stop` otherwise.
 * Shared by the hero renderers so offscreen or background tabs don't burn frames.
 *
 * @param {Element} el
 * @param {() => void} start
 * @param {() => void} stop
 * @returns {() => void} cleanup that removes the observers
 */
export function whileVisible(el, start, stop) {
    let onScreen = false;
    // null until the first evaluation, so an initially offscreen element still gets stop()
    // (callers may have started themselves before the observer reported).
    let running = null;

    // Both conditions must hold; either one changing re-evaluates.
    const update = () => {
        const shouldRun = onScreen && !document.hidden;
        if (shouldRun === running) return;
        running = shouldRun;
        if (shouldRun) {
            start();
        } else {
            stop();
        }
    };

    const io = new IntersectionObserver(
        entries => {
            for (const entry of entries) onScreen = entry.isIntersecting;
            update();
        },
        { threshold: 0.01 }
    );
    io.observe(el);
    document.addEventListener('visibilitychange', update);

    return () => {
        io.disconnect();
        document.removeEventListener('visibilitychange', update);
    };
}
