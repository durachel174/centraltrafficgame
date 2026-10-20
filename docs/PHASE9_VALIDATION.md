# Phase 9 validation — 2026-10-19

Audit basis: README, architecture/model documentation, existing implementation status phase definitions, scenario configuration, engine/scoring/replay code, worker and tutorial code, and all existing tests. No `AGENTS.md` or standalone original specification was present in this checkout or its ancestor guidance paths. Phase names/definitions are preserved. This milestone completes the user-specified Monday Morning play → understand → identical retry → deterministic replay acceptance conditions.

## Automated validation

- `npm test`: **97 passed** (all previous 84 retained; 13 additional Phase 9 tests).
- `npm run build`: passed, including separate preview and baseline worker bundles.
- `npm run simulate -- --runs=10 --controller=baseline`: passed.
- `npm run simulate -- --runs=10 --controller=reactive`: passed.
- `npm run benchmark`: attempted; the tsx CLI IPC pipe hit sandbox `EPERM`. The requested fallback `node --import tsx scripts/benchmark.ts` passed and ran the same benchmark entry point.
- `git diff --check`: passed.

Coverage includes exact incident start/restoration intervals in a controlled fixture and a full Monday Morning integration run; stage/event evidence across tick groupings; truthful restoration language; history Apply/Cancel; weighted component totals and copy safety; matching baseline identities/seeds and obsolete response rejection; complete file round trips and UI input/download handling; malformed/old/incompatible files and invalid action parameters/timing/duplicate ticks; full final metrics, executed log, and final-state checksum verification; rejected altered affected counts/rewards; replay live-action guards; pause/speed independence; same-seed demand/baseline; new-seed propagation; session cleanup; and distinct practice results.

JSDOM emits its existing Canvas-not-implemented warning. Its workers and file events are controlled test doubles. Those tests are **not** the browser evidence below.

## Ten paired seeds

Both controllers used seeds 428193 through 428202 with the unchanged Monday Morning demand, event, routing, and objective model.

| Mean over 10 runs | Baseline | Reactive |
| --- | ---: | ---: |
| Requested trips | 4,125 | 4,125 |
| Completed-trip average travel | 19.2 min | 19.6 min |
| Total system cost | 729,623 | 726,675 |

Reactive's mean cost was about 0.4% lower, while completed-trip average travel was higher. These aggregates do not establish improvement for every seed or an optimal policy.

## Headless performance

Measured once with validation browser simulations paused, using the existing benchmark (5,000 debug-spawned trips plus continuing demand). It reported 6,012 active vehicles at the measured state:

| Measurement | Result |
| --- | ---: |
| Average across 200 ticks | 3.697 ms/tick |
| Simulation throughput | 270.5 ticks/sec |
| Average across 20 previews | 128.256 ms/preview |
| Forced forecast refresh | 64.132 ms |

These are local headless measurements, not browser frame rates or guarantees. Preview and baseline rollouts execute in real browser workers. Normal engine ticks and scheduled forecast refreshes remain synchronous as before; the refresh measurement is a remaining potential source of occasional main-thread work.

## Real browser evidence

Used the in-app browser against development `localhost:5173` and built production `127.0.0.1:4173`, including final-build reloads after the last verification guard change. Both used actual Canvas rendering and actual workers; no test worker was injected.

Checked:

- Full live Monday Morning rounds at 4x through scenario end on both builds, with actual Preview → Apply decisions recorded once. History showed target, 25%, actual count 2, and immediate tick cost change 30.0 cost units.
- Real preview calculations returned both unfavorable passenger/cost consequences and alternative-road changes. The new-seed Hold preview showed zero affected trips honestly; Cancel left history empty.
- Rush-hour progression and replay incident feedback. Production was paused at 08:20 with North Bridge at 60% capacity, a 40% reduction starting at 08:12, seven scheduled minutes remaining, and 08:27 scheduled restoration.
- Development live recovery at 08:45 showed restored 100% capacity while selected-road utilization was still 282%. It explicitly said traffic may still be congested.
- Results showed finished and unfinished trip counts, completed-travel population definitions, satisfaction, compatible worker baseline, cost direction/sign explanation, weighted component table, and retry/replay/file actions. Small unfavorable improvements display as `-0.006%` rather than a rounded negative zero.
- Same-seed retry cleared history/notices/results and returned to 07:00 with seed 428193. The no-intervention retry finished at 690,161.0 cost, exactly its worker baseline.
- New Seed started seed 1571478730 with clean history and different demand/routing outcomes. It completed at 745,726.5 cost, matching its own worker baseline, with 1,827 completed, 2 waiting, and 2,296 active trips.
- Actual JSON downloads from development and production, followed by actual native file-picker imports. Imports were staged and did not replace the current session until **Start Imported Replay**.
- An imported engine-0.1.0 file showed **Incompatible engine version** and preserved the verified result/current session.
- Replay started paused at 07:00, restored its recorded seed, disabled intervention buttons, executed the recorded action stream, and allowed Pause, 2x/4x, and Restart Replay. Restart reset to the paused original state and cleared history/notifications.
- Both exported runs replayed to **verified completion** in browser. Final-build development checked the intervention-bearing seed 428193 run; final-build production checked seed 1571478730. Every metric, executed log, and deterministic final state matched. Both downloaded files were also independently parsed and replay-verified through the headless code.
- Desktop layouts at 1280×720 and 1440×900. Results and inspector contents scroll; objective components and history expand without replacing the map layout. Worker results, local file selection, transport controls, and replay status remained usable.

| Actual browser export | Decisions | Final system cost | Final state checksum |
| --- | ---: | ---: | --- |
| Seed 428193 | 1 | 690204.5063535798 | `7182aabbe4bcab0b` |
| Seed 1571478730 | 0 | 745726.4704741578 | `68d74e4b3df62e61` |

Screenshots: [incident](screenshots/phase9-incident.jpg), [recovery with congestion](screenshots/phase9-recovery.jpg), [verified replay](screenshots/phase9-replay-verified.jpg), [weighted components](screenshots/phase9-components.jpg), [new-seed verification](screenshots/phase9-new-seed-verified.jpg), [rejected import](screenshots/phase9-import-rejected.jpg).

## Remaining limitations

- Browser FPS/long-task instrumentation was not available through the browser automation API. Headless timings and observed usable controls are not FPS measurements.
- Mobile layouts, screen-reader behavior, and a fresh manual tutorial walkthrough were not re-audited in this milestone; the existing tutorial/Help/preview recovery regression tests remain passing.
- Worker-unavailable/error paths and altered-outcome replay rejection are tested with controlled fixtures; deliberate real-browser worker failure and replay-corruption-at-end were not injected.
- Imports support schema 1 / engine 0.2.0 / matching Monday Morning configuration only. No older-format conversion or practice-run replay is exposed. Same-tick duplicate commands are explicitly rejected under the one-action-per-engine-tick contract.
- Exports cover completed runs only; no autosave/resume of an unfinished browser session is implemented. The FNV checksum checks consistency, not file authenticity.
- Decision history reports actual affected counts and immediate tick cost changes, not long-term causal action attribution. No best/worst ranking or claim of optimality is made.
