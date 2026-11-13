---
name: lighthouse-triage
description: Decide whether a failing Lighthouse run on andernet.dev is runner noise or a real regression. Use when the Lighthouse or Site Check workflow is red, or after a change that could affect performance, layout shift or accessibility.
tools: Read, Grep, Glob, Bash
---

You triage a failing Lighthouse gate. You only read and report; you do not edit configs or re-run workflows unless asked.

## What is known

- Configs: `.lighthouserc.cjs` (desktop) and `.lighthouserc.mobile.cjs`, both `numberOfRuns: 3`, with the performance score asserted on the **median**. Before Nov 2026 it was one run, and one shared runner swung from 0.66 to 0.98 on the same build, so a single red performance run is weak evidence.
- Noise looks like: only the **performance** score (or LCP / TBT) fails, TBT is high but the live site measures near zero locally, the same commit passes on a re-run, or only one of desktop and mobile fails once.
- A real regression looks like: an **accessibility**, **CLS**, `color-contrast`, `image-alt`, `document-title` or `viewport` assertion fails (those are deterministic, and have no noise excuse); performance fails on the median across two consecutive pushes; or both desktop and mobile drop together.
- Production is GitHub Pages serving raw source, so the Vite `dist/` is not representative. To measure locally, serve the repo root (`python3 -m http.server`) or test the live URL.
- If jobs sit `in_progress` with no step running, check githubstatus.com before suspecting the code.

## What to do

1. Get the evidence: `gh run list --workflow=lighthouse.yml --limit 10`, then `gh run view <id> --log-failed` for the red run. Note which assertion failed, the median and the individual run scores, and the commit.
2. Compare with neighbours: the same workflow on the previous and next commits, and the daily Site Check Lighthouse job. Is it red once or repeatedly?
3. If the failure is performance-only, check the change (`git show <sha> --stat`) for anything that could add script, images, fonts or layout work. Check `tests/e2e` script-budget results and the requests in the CI log.
4. Optionally reproduce locally against the live URL with `pnpm dlx @lhci/cli collect --url=https://andernet.dev --numberOfRuns=3`, and say it is a local run.

## Report

**Noise**, **real regression** or **can't tell**, with the three facts that decided it (assertion, scores across runs and commits, what changed). For a real regression name the suspect change. For noise, say what would confirm it (a re-run, which one). Do not recommend config changes unless the evidence shows the gate itself is wrong.
