/**
 * The GitHub band in About (modules/ui.js): two live numbers and a contribution chart, hidden
 * when the data is not there. Notifications have their own tests in notification.test.js.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { githubAPI } from '../../modules/github-api.js';
import { UIManager } from '../../modules/ui.js';

const NOW = new Date('2026-11-15T12:00:00Z');
const daysAgo = days => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const BAND = `
    <section id="github-band">
        <b data-stat="active-repos">-</b>
        <b data-stat="contributions">-</b>
        <div class="github-band__chart"><div id="contribution-graph"></div></div>
    </section>`;

const day = (date, count, level) => ({ date, count, level });
const calendar = weeks => ({
    total: 1234,
    weeks: weeks.map(days => ({ days })),
});

const stat = name => document.querySelector(`[data-stat="${name}"]`).textContent;
const band = () => document.getElementById('github-band');
const chart = () => document.querySelector('.github-band__chart');

describe('loadGitHubStats', () => {
    let ui;

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        document.body.innerHTML = BAND;
        ui = new UIManager();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const stubData = ({ repos = [], contributions = calendar([]) } = {}) => {
        vi.spyOn(githubAPI, 'getRepositories').mockResolvedValue(repos);
        vi.spyOn(githubAPI, 'getContributions').mockResolvedValue(contributions);
    };

    it('does nothing on a page without the band', async () => {
        document.body.innerHTML = '';
        const spy = vi.spyOn(githubAPI, 'getRepositories');
        await ui.loadGitHubStats();
        expect(spy).not.toHaveBeenCalled();
    });

    it('counts the repositories pushed to in the last six months, not forks or archives', async () => {
        stubData({
            repos: [
                { pushed_at: daysAgo(3) },
                { pushed_at: daysAgo(179) },
                { pushed_at: daysAgo(181) },
                { pushed_at: daysAgo(1), fork: true },
                { pushed_at: daysAgo(1), archived: true },
            ],
        });
        await ui.loadGitHubStats();
        expect(stat('active-repos')).toBe('2');
    });

    it('shows zero active repositories for an empty list: the data is known', async () => {
        stubData({ repos: [] });
        await ui.loadGitHubStats();
        expect(stat('active-repos')).toBe('0');
        expect(band().hidden).toBe(false);
    });

    it('formats the contribution total', async () => {
        stubData({ contributions: calendar([]) });
        await ui.loadGitHubStats();
        expect(stat('contributions')).toBe((1234).toLocaleString());
    });

    it('leaves the contribution total as a dash when the calendar is missing', async () => {
        stubData({ repos: [{ pushed_at: daysAgo(1) }], contributions: null });
        await ui.loadGitHubStats();
        expect(stat('active-repos')).toBe('1');
        expect(stat('contributions')).toBe('-');
        expect(chart().hidden).toBe(true);
        expect(band().hidden).toBe(false);
    });

    it('hides the whole band when the repositories cannot be loaded', async () => {
        vi.spyOn(githubAPI, 'getRepositories').mockRejectedValue(new Error('no data'));
        vi.spyOn(githubAPI, 'getContributions').mockResolvedValue(calendar([]));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await ui.loadGitHubStats();
        expect(band().hidden).toBe(true);
    });
});

describe('renderContributionHeatmap', () => {
    let ui;
    let container;

    beforeEach(() => {
        document.body.innerHTML = BAND;
        container = document.getElementById('contribution-graph');
        ui = new UIManager();
    });

    const cells = () => [...container.querySelectorAll('.contrib__grid .contrib__cell')];
    const weeks = count =>
        Array.from({ length: count }, (_, index) => [
            day(`2026-01-${String(index + 1).padStart(2, '0')}`, index, index % 5),
        ]);

    it('does nothing without a container', () => {
        expect(() => ui.renderContributionHeatmap(calendar(weeks(1)), null)).not.toThrow();
    });

    it.each([
        ['no calendar', null],
        ['no weeks', {}],
        ['an empty calendar', calendar([])],
    ])('hides the chart and the space it reserves for %s', (_name, contributions) => {
        ui.renderContributionHeatmap(contributions, container);
        expect(chart().hidden).toBe(true);
        expect(container.innerHTML).toBe('');
    });

    it('hides the container itself when it has no wrapper', () => {
        document.body.innerHTML = '<div id="contribution-graph"></div>';
        const bare = document.getElementById('contribution-graph');
        ui.renderContributionHeatmap(null, bare);
        expect(bare.hidden).toBe(true);
    });

    it('draws one cell per day, with its level, its count and an accessible name', () => {
        ui.renderContributionHeatmap(
            calendar([[day('2026-11-09', 1, 1), day('2026-11-10', 4, 3)]]),
            container
        );
        const [first, second] = cells();
        expect(cells()).toHaveLength(2);
        expect(first.dataset.level).toBe('1');
        expect(first.title).toMatch(/^1 contribution on /);
        expect(second.dataset.level).toBe('3');
        expect(second.title).toMatch(/^4 contributions on /);
        expect(container.querySelector('[role="img"]').getAttribute('aria-label')).toBe(
            'Contribution activity, week by week'
        );
    });

    it('puts each day in the grid row of its weekday', () => {
        // 2026-11-08 is a Sunday, 2026-11-14 a Saturday
        ui.renderContributionHeatmap(
            calendar([[day('2026-11-08', 0, 0), day('2026-11-14', 0, 0)]]),
            container
        );
        const [sunday, saturday] = cells();
        expect(sunday.style.gridRow).toBe('1');
        expect(saturday.style.gridRow).toBe('7');
    });

    it('numbers the columns for both the year view and the phone view', () => {
        ui.renderContributionHeatmap(calendar(weeks(30)), container);
        const all = cells();
        // 30 weeks, the last 20 are "recent": week 11 is the first of them
        expect(all[0].style.getPropertyValue('--week')).toBe('1');
        expect(all[29].style.getPropertyValue('--week')).toBe('30');
        expect(all[10].style.getPropertyValue('--recent-week')).toBe('1');
        expect(all[29].style.getPropertyValue('--recent-week')).toBe('20');
    });

    it('marks the cells outside the last 20 weeks as older, for the phone layout to hide', () => {
        ui.renderContributionHeatmap(calendar(weeks(30)), container);
        const older = cells().filter(cell => cell.classList.contains('contrib__cell--older'));
        expect(older).toHaveLength(10);
        expect(cells()[10].classList.contains('contrib__cell--older')).toBe(false);
    });

    it('marks nothing as older when the calendar is shorter than the phone window', () => {
        ui.renderContributionHeatmap(calendar(weeks(5)), container);
        expect(container.querySelector('.contrib__cell--older')).toBeNull();
    });

    it('adds a legend with all five levels, hidden from screen readers', () => {
        ui.renderContributionHeatmap(calendar(weeks(1)), container);
        const legend = container.querySelector('.contrib__legend');
        expect(legend.getAttribute('aria-hidden')).toBe('true');
        expect(
            [...legend.querySelectorAll('.contrib__cell')].map(cell => cell.dataset.level)
        ).toEqual(['0', '1', '2', '3', '4']);
    });
});
