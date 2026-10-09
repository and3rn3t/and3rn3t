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
    io.observe(el);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
        io.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
    };
}
