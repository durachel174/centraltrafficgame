# Desktop candidate: test reliability and participant preparation

2026-10-20. Candidate based on `f452a85`; changes in this milestone are tests and documentation only. Engine **0.5.0 / Monday Morning 4 / run schema 2 / snapshot 3** is unchanged, including scoring, clearance, worker protocols, UI and replay compatibility. No AGENTS.md was found in the checkout or ancestor directories. README, implementation status, post-demand contract, replay format and relevant engine/store/tests were reviewed before editing. **Human participant sessions remain pending; Phase 12 is IN PROGRESS.**

## Timeout cause and change

The reported five-second failure is consistent with unnecessary synchronous forecast rollouts and contention between test files, not evidence of replay divergence. Locally, the original isolated test passed in 3.23 seconds (3.93 seconds including startup) with a temporary command-line 20-second limit for diagnosis. The independent reported 5.7-second result is retained as an external observation; this machine did not reproduce a timeout.

A separate diagnostic profile reproduced the original seed-6 workload (681 ticks and a debug spawn), using the engine's existing timing callback. It measured the source simulation separately from export/checksum and verified replay:

| Work | Synchronous forecasts | External forecasts |
| --- | ---: | ---: |
| Source run | 2,595.8 ms | 640.7 ms |
| Synchronous forecast work | 36 calls / 1,883.8 ms | 0 calls |
| Export/checksum | 25.3 ms | 18.6 ms |
| Verified replay | 715.3 ms | 733.8 ms |
| Final checksum | `9f2769f25f1ed83a` | `9f2769f25f1ed83a` |

[Raw diagnostic sample](measurements/desktop-rc/replay-profile.json). These are single-machine diagnostic samples, not performance assertions, distributions or benchmark improvements. Replay already used `externalForecasts=true`; the original source run did not. Synchronous forecasting represented about 73% of its source-run time. Derived forecasts are excluded from authoritative checksums by the existing contract; no verification fields were removed.

The generic “replaying action log produces the same final objective” test now uses a small controlled clearance fixture and external forecasts. It still executes an action and compares executed log, cutoff/final metrics and evaluation. The Phase 9 replay/format helper also uses external forecasts because those assertions do not consume projections. Dedicated synchronous forecast equality, forecast/preview isolation, worker parity, stale/error and UI tests are unchanged.

The full Monday Morning integration remains: two interventions, the scheduled bridge restriction/restoration, complete clearance, exported/parsed run, store-driven replay with pause/speed/live-action guards, and explicit equality for executed actions, decision-cutoff metrics, every final metric, evaluation including finish reason/time, and final-state checksum. The existing local **20-second** allowance is documented for two full runs, React/store checks and serialization on slower machines. The separate full-Monday Watch/fast-forward equivalence test retains its local ten-second allowance. No global timeout increase, retry, skipped assertion, weakened replay verifier or brittle wall-clock assertion was added.

## Correctness validation

Commands ran sequentially with normal Vitest test-file concurrency. No worker-pool reduction or global timeout override was used after diagnosis.

| Command | Result | Reported timing |
| --- | --- | --- |
| `npm test`, run 1 | 153/153, nine files | 3.72 s overall; 7.99 s summed tests |
| `npm test`, run 2 | 153/153, nine files | 3.78 s overall; 8.14 s summed tests |
| `npm test`, run 3 | 153/153, nine files | 3.85 s overall; 8.21 s summed tests |
| `npm test -- src/tests/phase9.test.tsx -t 'full Monday Morning integration'` | 1 passed; 12 unrelated tests filtered | 1.64 s test; 2.15 s overall |
| `npm run build` | TypeScript and production build passed | Vite bundling 1.33 s (not total command time) |

All 153 tests are retained. Across these three normal runs elapsed variation was 0.13 seconds; it is a small local sample, not a guarantee on every machine. The third run overlapped light browser validation. Expected JSDOM Canvas-not-implemented and Node local-storage warnings remain; simulated-worker/Canvas-free tests are not browser evidence. Benchmark measurements remain separate: no benchmark or wall-clock threshold runs as a correctness assertion.

The production main bundle remains `index-CaxDfMC2.js`, with the same forecast, baseline and preview worker bundles as the prior candidate. No production source or configuration changed.

## Production browser checks

Tested `npm exec vite -- preview --host 127.0.0.1 --port 4181 --strictPort` in the real in-app Chromium browser. A previously unused origin gave a fresh first-time tutorial without editing browser storage or injecting game state. Actual Canvas, forecast/baseline workers, preview calculation, local file picker and download were used.

- Fresh practice: Continue, keyboard road selection/forecast focus, real ready preview affecting six trips, Escape Cancel returning focus to Preview, a second Preview and keyboard Apply affecting six trips, observation, Continue Practice/free practice. A further free-practice preview affected sixteen trips and displayed South Bridge/Downtown Gate consequences and unfavorable cost/satisfaction effects. Cancel returned to play.
- Help opened with keyboard focus inside; Escape closed it and restored focus to Help. Keyboard Reset removed action feedback/history and returned to the warmed practice checkpoint.
- Monday seed 428193: 4x playback, configured bridge incident/restoration, exact 09:00 pause at **0.00** clearance, focus on clearance region and disabled intervention controls. Watch, 4x and Pause worked. Fast-forward cancellation retained **10.50 minutes** progress and installed a fresh source-time forecast, then resumed to results.
- Complete results: 4,125 requested/completed, zero unfinished, **49.50 min** clearance, cutoff accrued cost **217,435.4**, final and complete baseline cost **324,667.1**, improvement **0.0%**. Same-seed retry returned to 07:00 with seed 428193, zero history and no replay state. Export downloaded a real local JSON and its import required explicit Start Imported Replay.

- Imported complete run replayed to **09:49:30**, then reported verified metrics and deterministic state. The actual exported file retains checksum `b18607c503405c7e`, matching the previous 0.5.0 candidate. The separate existing Monday incomplete fixture (one day-long hold at 119.75 minutes, generated by `scripts/evaluation-fixtures.ts`) replayed to **13:00** and also reported verified. It retained **3,743 completed / 382 waiting / 0 active / 0 exit-queued** with accrued cost **537,606.5**, complete baseline **324,667.1**, and no final improvement percentage. No fixture or engine state was injected into the browser.
- Both tabs' captured error/warning console lists were empty after all flows. Actual worker ready results and source-labeled forecast refreshes were observed. No forced worker-error/retry browser check was performed in this milestone; automated coverage remains.
- Visually inspected practice review at **1440×900**, cutoff at **1280×720**, complete results at **1280×720** and incomplete results at **1440×900**. Review/results scroll and their controls remain reachable; no blocking layout issue was found. Dense overlapping map labels remain an existing visual limitation. Keyboard Enter, Escape, road selection, review/transition focus and Help focus restoration were exercised. This is not a screen-reader audit or full keyboard certification. Temporary viewport overrides were reset.

Screenshots: [exact cutoff](measurements/desktop-rc/cutoff-1280.png), [incident](measurements/desktop-rc/incident-1280.png), [verified complete](measurements/desktop-rc/complete-verified-1280.png), [verified incomplete](measurements/desktop-rc/incomplete-verified-1440.png). Actual production bundle and compatibility are unchanged from `f452a85`; this candidate's commit should be recorded before a participant session.

## Participant handoff and remaining limits

Use [DESKTOP_PLAYTEST.md](DESKTOP_PLAYTEST.md): build and serve production on localhost, open a fresh profile/private window, record the final commit/version/browser/seed, read the neutral introduction, then give tasks one at a time and use its blank observation sheet. Observe the choice and desire to retry before giving assistance. Incomplete results are an optional labeled prepared demonstration, not an expected participant outcome. Do not preload an imported replay for the first-time experience.

Human feedback, enjoyment/comprehension, independent screen-reader and cross-browser accessibility, mobile, cross-device performance and broader cost calibration remain unverified. The current scheduler yields between batches but an individual tick/checksum can exceed its budget. Storage cycles/unreachable trips remain possible and honestly end incomplete. Desktop road labels can be dense/overlap on the map; the labeled keyboard inspector remains available. This milestone does not redesign that layout or claim universal usability. No participant feedback or telemetry was created.
