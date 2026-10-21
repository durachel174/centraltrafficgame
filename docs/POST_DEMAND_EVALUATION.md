# Authoritative post-demand evaluation

Current contract, measured 2026-10-20: engine **0.5.0**, Monday Morning **4**, run schema **2**, snapshot **3**. This supersedes the fixed-window official result and separate diagnostic continuation in the historical [clearance investigation](CLEARANCE_INVESTIGATION.md). Phase 12 remains **IN PROGRESS**.

## Player and engine contract

Monday Morning accepts decisions until 09:00. The tick ending at 09:00 generates the final cohort for the preceding interval, then captures the immutable decision-cutoff metrics. Demand is never generated during clearance. Waiting trips can still enter roads. Existing holds, routes, queues, scheduled events and restrictions continue normally. No vehicles are removed, teleported or forced to arrive. The engine rejects non-NO_OP actions after decisions close with `info.actionRejected`, without advancing time, logs or state. Controllers stop deciding and continue NO_OP evaluation.

`getEvaluation()` is serializable in observations, information and environment state: phase, absolute decision cutoff, elapsed clearance minutes, maximum duration, absolute evaluation limit, finish reason and actual tick of finish. `isDone()` means evaluation finished. Scenarios configure `evaluation.maxClearanceMinutes`; the engine contains no Monday-specific boundary. Practice retains its unscored fixed window and tutorial flow.

At 09:00 playback pauses exactly at the boundary, intervention controls lock, pending previews invalidate, and focus moves to the explanatory clearance region. Watch Clearance uses existing pause/speed controls. Fast-forward to Results advances the same live engine ticks in timer batches (at most eight ticks, checking an eight-millisecond budget before each tick). Cancel preserves completed progress and returns to watching. Help, reset and scenario changes cancel scheduled batches. An atomic tick or final checksum can exceed the budget; this is bounded cooperative scheduling, not a hard frame-time guarantee or background simulation.

Monday allows **240 additional minutes**, through 13:00. The corrected investigation's fourteen policies across ten seeds all cleared within 43.25–170.25 minutes, leaving 69.75 minutes above that observed maximum. This limit is deterministic, configurable and not evidence that all strategies must clear. The engine ends when every requested trip arrives or the limit is reached. It does not infer deadlock from a quiet interval. Storage cycles, unreachable routes and long holds may remain unresolved.

## Costs, results and compatibility

Official evaluation accrues actual waiting, movement, distance and congestion through the authoritative end tick, using unchanged weights. Untravelled planned detours do not count as realized kilometres. Remaining-hold estimates are retained only in the historical cutoff checkpoint and never added to realized final costs. Consequently current cutoff costs differ from historical engine 0.4 figures, which included planned distance/terminal liability. All-arrived final costs for the original fourteen-policy audit reproduce the corrected 0.4 diagnostic continuation costs.

Complete results show cutoff accrued cost, final realized system cost (lower is better), clearance duration, arrival-only travel statistics, satisfaction over all riders, objective components and passenger counts. Final improvement (higher is better) requires a matching engine/scenario/configuration/seed and both player and no-action baseline finishing all-arrived. If either is incomplete, their statuses and accrued costs appear separately, without a normal improvement percentage. Safety-limit results say **Evaluation incomplete**, retain completed, waiting, active and exit-queued counts, and explain that accrued costs are not full-journey costs. Exit queues are a subset of active trips. No rating or optimality is claimed.

Previews remain explicit Preview → Review → Apply/Cancel. Rollouts crossing 09:00 obey the same demand/action boundary and disclose the actual horizon, inclusion of clearance, branch finish differences and truncation. A short-horizon delta is not a final-cost prediction. Preview/forecast epochs invalidate at the phase transition and reset. Fast-forward suspends forecast requests; watching resumes fresh labeled projections. Obsolete workers cannot install results.

Schema 2 records cutoff metrics, evaluation configuration/status/finish time, final metrics, interventions and checksum. Replay executes through clearance and verifies these records. Post-cutoff actions, older schemas/engine/scenario identities and incompatible snapshots are explicitly rejected. Snapshot 3 stores the checkpoint; phase derives from authoritative time, scenario and unresolved trips. Speed, worker completion order and Watch/fast-forward choices are not simulation inputs.

## Paired policy evidence

Seeds **428193–428202**, 4,125 requests per run, 15 policies × 10 seeds = **150 unique runs**. [Machine-readable results](measurements/phase12-full-clearance.json) contain identities, cutoff/final metrics, completion metadata and rankings. All fourteen original policies completed; the added late day-long hold was incomplete on all seeds and excluded from final rankings. Means below are costs, not invented ratings. Ranking changes compare each completed policy with baseline at cutoff versus final, within the same seed.

| Policy | Cutoff accrued cost | Final cost / limit accrued cost | Complete | Mean clearance min | Rank changes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 212,504 | 314,227 | 10/10 | 47.975 | 0 |
| Reactive | 216,186 | 319,708 | 10/10 | 49.600 | 4 |
| Repeated hold 25%, 5m | 213,397 | 315,294 | 10/10 | 47.475 | 2 |
| Extended hold 100%, 120m | 227,346 | 511,543 | 10/10 | 161.250 | 0 |
| Repeated reroute 25% | 268,183 | 483,218 | 10/10 | 68.550 | 0 |
| Repeated reroute 100% | 435,231 | 890,769 | 10/10 | 97.575 | 0 |
| Late reroute 25% at 90m | 214,064 | 331,095 | 10/10 | 50.300 | 1 |
| Late reroute 100% at 90m | 228,330 | 388,267 | 10/10 | 59.900 | 0 |
| Late reroute 25% at 105m | 215,719 | 331,403 | 10/10 | 50.875 | 0 |
| Late reroute 100% at 105m | 217,723 | 399,599 | 10/10 | 66.350 | 0 |
| Late reroute 25% at 115m | 213,204 | 330,473 | 10/10 | 49.775 | 0 |
| Late reroute 100% at 115m | 214,065 | 372,640 | 10/10 | 68.575 | 0 |
| Combined 25% from 90m | 228,858 | 479,028 | 10/10 | 82.550 | 0 |
| Combined 100%, extended from 105m | 218,945 | 569,053 | 10/10 | 162.800 | 0 |
| Day-long hold at 119.75m | 212,505 | 488,951 (incomplete accrued) | 0/10 | 240.000 | excluded |

Reactive remains worse than baseline on mean final cost. Lower apparent cutoff cost does not establish a final benefit. The incomplete row is not ranked against complete journeys. Baseline/reactive mean completed travel times were 28.5/29.1 minutes. No weights were tuned to favor reactive.

## Validation and reproduction

```sh
npm test
npm run build
node --import tsx scripts/simulate.ts --runs=10 --controller=baseline
node --import tsx scripts/simulate.ts --runs=10 --controller=reactive
node --import tsx scripts/benchmark.ts
node --import tsx scripts/audit-clearance.ts
node --import tsx scripts/evaluation-fixtures.ts
```

The clearance audit defaults to the ten listed seeds and includes the late day-long hold policy; `--limit` selects its positive tick-aligned official safety limit, never a cloned continuation. Policy/endgame audit commands use `--clearance-minutes`. Fixtures export complete and incomplete runs of the existing Monday scenario to `/private/tmp/central-traffic-evaluation-fixtures` for local import.

**153 tests passed in nine files; production build passed.** Existing tests are retained. Controlled fixtures cover exact final demand, atomic rejected actions, hold/event continuity, finite completion, unreachable routes/storage cycles, passenger conservation, realized distance, historical checkpoint immutability, complete/incomplete baseline combinations, crossing previews, cancellation/reset/obsolete-worker isolation, complete/incomplete replay and old-format rejection. Full Monday integration verifies identical Watch and fast-forward results; UI interaction regression catches an extra quarter-tick at 4x playback after transition and verifies the corrected exact boundary.

Existing headless benchmark: 1,436 active vehicles, 200 ticks, **5.147 ms/tick**, **194.3 ticks/s**, 20 previews at **154.319 ms/preview**, forecast refresh **79.035 ms**. These are this-machine samples, not a comparative speedup or browser FPS guarantee.

Real development (`vite`, port 5180) and production (`vite preview`, port 4180) browser checks used actual Canvas and module workers, not injected store state or mocked workers. Both exercised the live 09:00 pause, locked controls, Watch/pause/4x, fast-forward, complete results/baseline, local export/import and verified replay, and an imported incomplete one-action replay through 13:00. Cancellation preserved live progress and refreshed forecasts. Same-seed retry was verified in both. Development also exercised tutorial Preview/Cancel/Apply, Skip/free practice, Help return and reset. Keyboard activation and transition focus were checked at the desktop 1280×720 layout. A production completed export and development completed export matched every metric, action, checkpoint, evaluation field and checksum exactly: **b18607c503405c7e** ([record](measurements/post-demand/browser-equivalence.json)).

Seed 428193 baseline finished at 09:49:30 with 4,125 completed, zero unfinished, cutoff cost 217,435.4, final cost 324,667.1 and 83.8% satisfaction. The imported day-long hold finished incomplete at 13:00 with 3,743 completed, 382 waiting, zero active/exit-queued, cutoff cost 217,436.9 and accrued cost 537,606.5; its baseline completed at 324,667.1. Both complete and incomplete imported replays reported verified final metrics/state in the real production browser.

Screenshots: [transition](measurements/post-demand/transition.png), [cancelled fast-forward](measurements/post-demand/canceled.png), [complete](measurements/post-demand/complete.png), [incomplete verified replay](measurements/post-demand/incomplete.png).

## Remaining limitations

This implements an honest end-of-demand evaluation, not proof of network liveness or calibrated city economics. Full storage cycles/unreachable routes remain possible. The safety limit is supported by this seed/policy sample, not universal clearance evidence. Completed-trip travel statistics exclude unfinished riders, who remain in counts, costs and satisfaction. Broader policy/seeds, cost calibration, cross-device performance, independent accessibility/screen-reader testing, mobile layouts and human playtesting remain unverified or unfinished. Timer batching yields between batches; a single expensive tick/checksum can still occupy the main thread. Practice remains intentionally fixed-window and unscored. Historical 0.4 exports are incompatible by design.
