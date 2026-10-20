# Phase 12 performance and balancing milestone

Status: **IN PROGRESS**, 2026-10-19. This milestone measures and removes confirmed browser forecast blocking, audits finite-window scoring and pacing, and preserves the completed challenge/replay flow. It does not complete mobile, accessibility, visual polish or human playtesting. No AGENTS.md or standalone original specification was found in the checkout; existing README, phased implementation status, Phase 9 validation and implementation were reviewed before changes.

## Reproduction and validation

```sh
npm test
npm run build
npm run simulate -- --runs=10 --controller=baseline
npm run simulate -- --runs=10 --controller=reactive
npm run benchmark
# Allowed fallback if tsx CLI cannot create its IPC pipe:
node --import tsx scripts/benchmark.ts
node --import tsx scripts/simulate.ts --runs=10 --controller=baseline
npm run audit:policies -- --runs=10 --clearance-minutes=0
npm run audit:policies -- --runs=10 --clearance-minutes=0 --legacy-cutoff
npm run audit:holds -- --runs=10
npm run audit:holds -- --runs=10 --legacy-cutoff
npm run audit:pacing -- --runs=10
# Optional capped diagnostic; not used for gameplay scores:
npm run audit:policies -- --runs=10 --clearance-minutes=120
```

All **108 tests passed**, including the existing 97 tests, bounded instrumentation/determinism, forecast worker parity/freshness/coalescing/session isolation, UI age/horizon/Retry, checksum/replay independence, compatibility rejection and terminal hold accounting. No brittle performance timing assertions were added. Build passed and emitted separate forecast, preview and baseline worker bundles. JSDOM Canvas warnings are expected; simulated workers are not browser validation.

Ten baseline and ten reactive headless runs completed: mean system costs **729,623.25** and **726,674.91**, respectively (4,125 requests each; average completed-trip travel 19.2 and 19.6 minutes). The benchmark's tsx CLI hit the environment's IPC EPERM; the documented `node --import tsx` fallback completed: 6,012 active vehicles, 200 ticks, 3.500 ms mean tick / 285.7 ticks/sec; 20 previews averaged 118.591 ms; one synchronous forecast refresh 62.941 ms. These are headless throughput/cost measurements, not rendering FPS. Neither controller is an optimality benchmark.

## Browser measurement method

Actual Chromium **155.0.0.0**, in-app browser, macOS host (`uname` arm64; UA reports Intel Mac OS 10_15_7), **1280×800**, visible tab, reported 11 hardware threads and 16 GB device memory; exact CPU model unavailable. Each workload is a separate ~20-second bounded opt-in development capture, seed **428193**. No audit/benchmark was running during these captures. Instrumentation was committed before the architecture change (`16ba494`). The post-change runs use the same scenario traffic/configuration, speed, viewport and prepared state. The terminal correction does not affect these no-hold trajectories.

Run `npm run dev`; finish/skip tutorial; expand **Local performance capture**, choose workload → **Prepare measurement workload** (resets run) → **Capture 20 seconds**. For preview-map, immediately click Preview Reroute; intentional pause remains in effect while the map stays visible. Do not advance the simulation through arbitrary browser evaluation. Capture uses 4,096 retained samples per metric, reports total seen, stops after 20 seconds, and sends no telemetry. JSON summaries include start/end time, active count, speed, browser, viewport, sample counts and duration. Main-thread snapshot copy and `postMessage` structured-clone posting are distinct from worker calculation/round trip. Worker timing excludes authoritative engine state. Production records nothing and renders no performance panel.

Before/after are **single captures**, not repeated statistical trials or cross-device guarantees. Rush starts at 08:00; incident starts at 08:13 (after activation); both reach 09:00 before capture ends, so frame distributions include an idle results tail. Start/end metadata permits comparison over the same simulation range. The 5,000 stress workload injects debug vehicles at 07:00:15 and grows past 6,800/7,000 vehicles; it is not a scored normal-play policy. Preparing now explicitly invalidates pre-checkpoint pending forecasts before capture.

### Frame cadence and main-thread work

Cells are **sample count / median / p95 / max**, durations in **milliseconds**. Zero means no observed entries, not unsupported (long-task support was present).

#### rAF interval

| Workload | Before | After |
| --- | --- | --- |
| normal-1x | 2392 / 8.30 / 9.90 / 25.00 | 2394 / 8.30 / 10.10 / 18.10 |
| normal-4x | 2304 / 8.30 / 10.10 / 100.00 | 2347 / 8.30 / 10.20 / 27.00 |
| rush-4x | 2184 / 8.30 / 10.20 / 125.00 | 2312 / 8.30 / 10.00 / 51.60 |
| incident-4x | 2229 / 8.30 / 10.20 / 125.80 | 2302 / 8.30 / 10.00 / 58.00 |
| 5000-4x | 2112 / 8.30 / 10.20 / 143.20 | 2226 / 8.30 / 10.00 / 42.60 |
| preview-map | 2398 / 8.30 / 10.10 / 16.70 | 2400 / 8.30 / 10.20 / 10.40 |

#### Simulation tick

| Workload | Before | After |
| --- | --- | --- |
| normal-1x | 75 / 0.50 / 1.30 / 21.60 | 75 / 0.60 / 1.50 / 3.10 |
| normal-4x | 292 / 1.05 / 5.40 / 89.60 | 292 / 1.10 / 3.90 / 9.10 |
| rush-4x | 240 / 3.50 / 8.10 / 107.40 | 240 / 2.85 / 6.00 / 7.90 |
| incident-4x | 188 / 3.40 / 8.10 / 104.90 | 188 / 3.50 / 7.20 / 9.30 |
| 5000-4x | 264 / 3.40 / 9.70 / 119.50 | 280 / 3.40 / 7.60 / 8.90 |
| preview-map | 4 / 0.75 / 0.80 / 0.80 | 4 / 0.65 / 0.70 / 0.70 |

#### Canvas draw

| Workload | Before | After |
| --- | --- | --- |
| normal-1x | 75 / 1.00 / 1.40 / 1.50 | 75 / 1.30 / 1.60 / 1.90 |
| normal-4x | 73 / 1.00 / 1.40 / 1.50 | 73 / 1.30 / 1.80 / 1.80 |
| rush-4x | 60 / 1.20 / 1.50 / 1.60 | 60 / 1.30 / 1.70 / 2.60 |
| incident-4x | 47 / 1.20 / 1.70 / 2.40 | 47 / 1.30 / 1.70 / 1.90 |
| 5000-4x | 66 / 1.70 / 2.10 / 2.50 | 70 / 1.80 / 2.10 / 2.30 |
| preview-map | 2 / 1.05 / 1.50 / 1.50 | 2 / 0.95 / 1.00 / 1.00 |

#### Long tasks

| Workload | Before | After |
| --- | --- | --- |
| normal-1x | 0 / — / — / — | 0 / — / — / — |
| normal-4x | 8 / 74.50 / 106.00 / 106.00 | 0 / — / — / — |
| rush-4x | 12 / 110.50 / 134.00 / 134.00 | 1 / 53.00 / 53.00 / 53.00 |
| incident-4x | 10 / 115.50 / 130.00 / 130.00 | 1 / 66.00 / 66.00 / 66.00 |
| 5000-4x | 13 / 121.00 / 149.00 / 149.00 | 0 / — / — / — |
| preview-map | 0 / — / — / — | 0 / — / — / — |

The median rAF interval is 8.3 ms (~120.5 callbacks/sec) in every capture. That is display callback cadence, **not** distinct rendered traffic frames. Canvas updates follow published simulation updates: e.g. high-load before 66 draws/264 ticks in 20 seconds, after 70 draws/280 ticks. Each 4× update advances four ticks; nominal simulation target is 16 ticks/sec, with actual timer/CPU delays reported above. Animation callback median alone hides jank: worst high-load frame gap fell **143.2 → 42.6 ms**, tick maximum **119.5 → 8.9 ms**, and long tasks **13 → 0**. Normal 4× maximum gap fell **100 → 27 ms**. Rush and incident still each show one post-change long task (53 and 66 ms): no claim that all blocking has disappeared. Canvas cost stayed small; no rendering rewrite was justified.

### Forecast, snapshot and preview timings

Cells again use **n / median / p95 / max ms**. Synchronous forecast-before and worker-after calculations measure different execution threads; offloading aims to reduce main-thread blocking, not eliminate the computation.

| Workload | Forecast main before | Forecast worker after | Forecast round trip after |
| --- | --- | --- | --- |
| normal-1x | 3 / 18.10 / 20.90 / 20.90 | 3 / 20.10 / 21.10 / 21.10 | 3 / 21.10 / 22.20 / 22.20 |
| normal-4x | 14 / 42.65 / 87.40 / 87.40 | 15 / 37.60 / 75.50 / 75.50 | 15 / 40.10 / 113.70 / 113.70 |
| rush-4x | 12 / 88.00 / 104.10 / 104.10 | 12 / 83.70 / 98.00 / 98.00 | 12 / 95.20 / 130.30 / 130.30 |
| incident-4x | 10 / 93.30 / 101.60 / 101.60 | 9 / 87.90 / 101.00 / 101.00 | 9 / 98.20 / 135.60 / 135.60 |
| 5000-4x | 13 / 92.40 / 117.00 / 117.00 | 13 / 90.90 / 122.00 / 122.00 | 13 / 100.30 / 134.10 / 134.10 |
| preview-map | 0 / — / — / — | 0 / — / — / — | 0 / — / — / — |

| Workload | Snapshot after | Structured-clone post after |
| --- | --- | --- |
| normal-1x | 3 / 0.10 / 0.10 / 0.10 | 3 / 0.40 / 0.40 / 0.40 |
| normal-4x | 15 / 0.20 / 0.60 / 0.60 | 15 / 1.00 / 2.90 / 2.90 |
| rush-4x | 13 / 0.60 / 0.90 / 0.90 | 12 / 3.55 / 5.10 / 5.10 |
| incident-4x | 10 / 0.85 / 1.00 / 1.00 | 9 / 4.50 / 5.10 / 5.10 |
| 5000-4x | 14 / 0.60 / 0.90 / 0.90 | 14 / 4.90 / 6.00 / 6.00 |
| preview-map | 1 / 0.20 / 0.20 / 0.20 | 1 / 1.20 / 1.20 / 1.20 |

| Preview-map | Worker calculation | Round trip | Snapshot | Structured-clone post |
| --- | --- | --- | --- | --- |
| Before | 1 / 128.90 / 128.90 / 128.90 | 1 / 156.30 / 156.30 / 156.30 | 1 / 0.20 / 0.20 / 0.20 | 1 / 1.10 / 1.10 / 1.10 |
| After | 1 / 115.30 / 115.30 / 115.30 | 1 / 137.60 / 137.60 / 137.60 | 1 / 0.20 / 0.20 / 0.20 | 1 / 1.20 / 1.20 / 1.20 |

Before: rush/incident synchronous forecasts averaged ~88–93 ms median and coincided with repeated long tasks; high-load median 92.4 ms. After: equivalent deterministic rollouts run off-thread; main-thread posting peaks at 6 ms in the stress capture. Worker round-trip can exceed calculation time due to serialization, scheduling, startup and main-thread delivery. Preview capture contains only one actual request, so its latency is a smoke sample, not a robust distribution. Original full per-metric summaries: [before](measurements/phase12-before.json), [after](measurements/phase12-after.json).

## Forecast architecture and correctness

Browser scheduled forecasts use one dedicated persistent worker, at most one in-flight request and one pending bit; no accumulated snapshot queue. Snapshots are created on dispatch. Requests/responses carry source simulation time, session, revision and invalidation epoch. Actions, actual incident-state changes, reset and seed/scenario transitions clear obsolete projections and terminate obsolete workers. Errors offer Retry Forecast with no blocking synchronous fallback. Default headless forecasting stays synchronous with unchanged configured refresh intervals and source-snapshot numerical results.

Accept an earlier revision only while source age is nonnegative and at most **one configured refresh interval** (Monday: five simulated minutes). Exact current-revision equality would starve playback. Source time/age are displayed; actual horizon labels subtract that age, past samples disappear, and old data expires instead of being presented as a fresh +5 prediction. An ordinary refresh can show valid older data with its age; invalidation clears it immediately. Engine caches are not written by worker completion. Replay checksums exclude derived forecasts/alerts and forecast bookkeeping, preserving authoritative graph/trips/RNG/demand/metrics/rewards/logs/events/restrictions. Tests prove synchronous/async run and verified replay equivalence.

## Scoring audit: ten paired seeds

Seeds **428193–428202**, 120-minute action/evaluation window, identical demand/events/weights. Reports contain mean raw inputs and every weighted objective component; curated small summaries are committed, per-run logs remain local. Eight policies: no intervention; existing reactive controller; North Bridge 25%/5-minute hold every minute; 100% waiting 120-minute hold every five minutes; 100% waiting 120-minute hold every tick; North Bridge 100% reroute every five minutes; North Bridge 100%/60-minute hold every minute after minute 105; North Bridge 100% reroute every two minutes after 105. Holds affect currently eligible waiting trips, not future demand. Audit scripts skip unused forecast computation for policies based only on current observations; demand/actions/scoring are unchanged.

All means below have 4,125 requested trips. Travel/waiting/committed hold are **passenger-minutes**; satisfaction is percent; congestion is integrated squared excess utilization; excess distance is km. Cost is lower-is-better. Fractional trip counts are means, not individual runs.

| Policy | Completed | Active | Waiting | Travel | Accrued waiting | Committed hold | Satisfaction | Congestion | Excess km | Old cost | New cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 1,949.40 | 2,173.60 | 2.00 | 110,057.80 | 0.00 | 0.00 | 88.94 | 5,637.25 | 7,195.18 | 729,623.25 | 729,623.25 |
| reactive | 1,926.60 | 2,196.40 | 2.00 | 111,112.75 | 22.00 | 0.00 | 88.65 | 5,572.95 | 7,230.66 | 726,674.91 | 726,674.91 |
| repeated-road-hold | 1,947.40 | 2,175.30 | 2.30 | 110,186.80 | 115.60 | 0.40 | 88.88 | 5,560.95 | 7,692.07 | 723,611.67 | 723,612.55 |
| long-all-hold | 1,921.00 | 1,998.00 | 206.00 | 101,627.20 | 10,650.00 | 23,460.00 | 88.17 | 5,076.23 | 7,161.07 | 696,723.99 | 748,335.99 |
| continuous-long-hold | 0.00 | 0.00 | 4,125.00 | 0.00 | 216,270.50 | 493,729.25 | 58.06 | 0.00 | 0.00 | 769,922.98 | 1,856,127.33 |
| aggressive-reroute | 505.70 | 3,617.30 | 2.00 | 177,529.42 | 0.00 | 0.00 | 69.53 | 16,042.38 | 21,762.16 | 1,934,825.92 | 1,934,825.92 |
| late-hold | 1,949.40 | 2,150.50 | 25.10 | 109,848.20 | 209.60 | 1,362.90 | 88.90 | 5,608.04 | 7,189.72 | 727,378.09 | 730,376.47 |
| late-reroute | 1,949.40 | 2,173.60 | 2.00 | 110,057.80 | 0.00 | 0.00 | 88.78 | 5,637.25 | 11,336.55 | 734,491.52 | 734,491.52 |

Weighted components (**cost units**, after correction):

| Policy | Travel | Congestion | Accrued waiting | Dissatisfaction | Excess distance | Terminal hold | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 110,057.80 | 535,538.31 | 0.00 | 77,551.48 | 6,475.66 | 0.00 | 729,623.25 |
| reactive | 111,112.75 | 529,429.97 | 48.40 | 79,576.19 | 6,507.59 | 0.00 | 726,674.91 |
| repeated-road-hold | 110,186.80 | 528,290.02 | 254.32 | 77,957.67 | 6,922.86 | 0.88 | 723,612.55 |
| long-all-hold | 101,627.20 | 482,242.01 | 23,430.00 | 82,979.81 | 6,444.96 | 51,612.00 | 748,335.99 |
| continuous-long-hold | 0.00 | 0.00 | 475,795.10 | 294,127.88 | 0.00 | 1,086,204.35 | 1,856,127.33 |
| aggressive-reroute | 177,529.42 | 1,524,025.93 | 0.00 | 213,684.62 | 19,585.94 | 0.00 | 1,934,825.92 |
| late-hold | 109,848.20 | 532,764.11 | 461.12 | 77,833.92 | 6,470.75 | 2,998.38 | 730,376.47 |
| late-reroute | 110,057.80 | 535,538.31 | 0.00 | 78,692.52 | 10,202.89 | 0.00 | 734,491.52 |

Full aggregates: [before](measurements/phase12-policy-before.json), [after](measurements/phase12-policy-after.json). Baseline and reactive scores are unchanged. Short repeated holds can still help; aggressive rerouting can be very harmful. The audit does not require the reactive controller to win.

### Evidence and correction

Long-all holds previously scored ~32,899 below baseline while leaving 206 waiting on average; that comparison alone cannot prove an exploit because congestion avoidance may be legitimate. A stronger controlled witness holds all waiting trips every tick in the last five minutes, once with duration **5** and once with duration **1,440** minutes. For all ten seeds the dispatch/travel/count outcomes through 09:00 and old cost are identical, despite the day hold imposing **83,230 extra passenger-minutes** beyond the cutoff. Old mean baseline 729,623.25; both hold variants 728,057.05. This is an unpriced known obligation, not an assumption about later network congestion.

Correction: Monday version 2 adds a separately accounted terminal imposed-hold component at 09:00: `departureDelayWeight × sum(max(heldUntil − endTime, 0))` for still-waiting trips. Reuses the existing **2.2 cost units/passenger-minute** weight; no penalty tuning. Accrued waiting is already charged and not added again. Expired/unheld trips incur no terminal hold cost. No traffic/demand/routing changes and no extended gameplay window. Witness mean short cost becomes 728,663.15; day cost 911,769.15: exact additional **183,106** cost units in every seed, pricing the 83,230 additional passenger-minutes. [Before witness](measurements/phase12-hold-horizon-before.json), [after witness](measurements/phase12-hold-horizon-after.json).

Previews reaching scenario end use the same component and label committed future hold separately from observed passenger-delay delta. Results show raw remaining imposed-hold passenger-minutes and the weighted component. No invented future satisfaction or congestion benefit is shown. Baseline weights/configuration compatibility remain explicit. Practice disables scored terminal accounting.

This is a justified **lower bound**, not full transport clearance. An exploratory seven-policy ten-seed continuation with no new demand/actions was capped at an additional 120 minutes; **none of the 70 runs cleared**. Those outcomes are censored and do not establish complete-journey rankings. Long BPR travel tails make full clearance and active-trip residual cost a further modeling question. No censored diagnostic score is substituted for gameplay score. The 120-minute decision and final evaluation window remains unchanged; only the known post-window hold obligation is priced separately.

Compatibility: engine **0.3.0**, Monday Morning **2**, six weighted components plus raw remaining hold metric. Engine 0.2.0 / Monday 1 imports are rejected explicitly; no silent rescoring. Run schema stays 1 because exact engine/configuration compatibility is already required. Derived-cache checksum exclusion is part of this engine-version change. Fresh 0.3 exports/replays must be verified, not inferred from old Phase 9 evidence.

## Pacing audit

Ten same seeds, no-action source trajectory, quarter-tick first-warning/overload checks and **five-minute sampled** North/South Bridge previews for the actual UI actions (25% reroute, 25% five-minute hold). A candidate requires affected trips >0 and at least one of: absolute cost delta ≥1 cost unit, absolute passenger-delay delta ≥0.1 passenger-minute, or utilization change ≥1 percentage point. Unfavorable choices count; zero-effect actions do not.

Across 332 comparisons: **64 zero-affected**, **268 candidate comparisons**, **85 lower-cost** and **183 higher-cost**. Per seed: **21–34** candidates over **7–16** distinct sampled times. First warning and first candidate occur at **40–50 simulated minutes** (07:40–07:50): roughly 40–50 seconds at ideal 1× or 10–12.5 seconds at 4×, plus timer/CPU delays. North Bridge warning lead is **3.25–15 minutes**, South Bridge **9.25–14.5 minutes** before first overload. Affected counts span **1–190**. Adjacent candidate slots are five minutes apart in this sampling (five seconds at ideal 1× / 1.25 seconds at 4×); this is a grid resolution, not measured independent player decision frequency. Sampled holds expire by 09:00, so terminal accounting does not change these comparisons. [Per-seed summary](measurements/phase12-pacing.json).

Projection horizons (usually 15 minutes) overlap multiple candidate slots. A player may need to pause to read and observe; explicit Preview provides that pause without consuming simulation time. The tutorial still warms to its gentler checkpoint and uses a shorter five-minute action-review horizon. Automated counterfactuals establish available effects, not fun, comprehension, urgency, or whether a human notices the next decision. No demand/capacity/checkpoint/cooldown change is supported by this proxy alone; configuration is preserved. Next balancing milestone should include human sessions, observed decision cadence and unfinished-trip residual evaluation before broad tuning.

## Browser functional verification

Actual local browser checks used Vite development at `localhost:5173` and the built production server at `127.0.0.1:4173`, Chromium 155. Desktop layouts were checked at 1280×800 and 1440×900. The map and scrollable review remained usable; a full review requires scrolling the compact inspector. Production exposes neither Dev controls nor the timing panel.

| Flow | Development | Production |
| --- | --- | --- |
| Normal playback / forecasts | Actual 1×/4× measured captures; age/horizons update | Actual 1×/4× playback; source age/horizons observed |
| Rush / incident / restoration | Prepared captures plus full Monday and replay; source refreshed at 08:12:15 | Full Monday/replay, source updates; high-load replay observed at recovery |
| High-load rendering | 5,000→7,078 active during measured capture | Actual imported stress replay, 5,000 initial debug vehicles, 9,123 active at finish; map rendered, forecast source updated, no console errors |
| Explicit Preview / Apply / Cancel | Actual workers, one applied 42-trip reroute; cancellation preserves history; unfavorable/spillover review visible | Actual reroute/hold workers, zero-affected hold review, normal-practice unfavorable reroute, tutorial Apply executed six affected trips; Cancel leaves history unchanged |
| Stale / Retry / Help / reset | Resumed playback invalidates review; Retry recalculates; Help return/reset clears session state | Stale Hold review after 4× resume, Retry through real worker; Help and reset/new session recover |
| Tutorial | Complete through observation and Start Monday; relevant preview, Cancel and recovery | Keyboard Preview, Cancel returns to preview, Apply/Resume/observed outcome, Continue Practice, Practice Again |
| Keyboard focus | Tab from Preview while 4× playback continues | Same in normal play; tutorial focus does not advance; Enter requests preview |
| Results / baseline | Real Monday finish: 4,125 requested, 2,167 completed, 1,956 active, 2 waiting; compatible baseline 690,161.0 | Same Monday result; practice completion has 976 requested, 331 completed, 643 active, 2 waiting, practice actions and no competitive rating |
| Reset / new seed | Seed 1619134636, old forecast source/history cleared, full round ended consistently | Seed 1588433213 reset to 07:00; practice and replay transitions cleared old state |
| Completed export / import / replay | Actual JSON download, local file chooser import, staged Start Imported Replay, 09:00 verified metrics/state | Same actual completed export/import/verified replay; engine 0.2 file rejected without session replacement |

The 0.3 browser exports above were no-action runs (zero decisions); they were not old files reused as evidence. In addition, production imported a fresh headless-generated 0.3 **stress fixture** through the actual local file chooser, with DEBUG_SPAWN(5000) and a recorded reroute. This is a reproducible debug replay test, not ordinary player performance or a benchmark score. It reached 09:00 with **9,125 requested / 0 completed / 9,123 active / 2 waiting**, system cost 36,423,939.99412516, and **verified every final metric, executed action log and state checksum**. This specifically exercises production replay across sync/headless source and async browser forecast scheduling, with actual recorded actions under high load. The fixture remains local under `/private/tmp/phase12-high-load-run.json`.

Screenshots: [shared production review](screenshots/phase12-production-review.jpg), [production verified replay/results](screenshots/phase12-production-verified.jpg), [production high-load playback](screenshots/phase12-production-stress.jpg). Console error/warning inspection during production stress playback returned none.

Unverified browser checks: the available UI API has no pointer-hover action, so hover itself is covered by interaction tests only. Forced worker-failure Retry and synthetic late-message delivery are verified in tests, not induced in a real browser; actual stale Retry was checked on both builds. Current-build tutorial Skip was retained and tested by the existing interaction suite, but not independently repeated in this browser pass. Production high-load playback was a visual/state smoke check, not instrumented FPS; bounded timing instrumentation intentionally exists only in development. No screen-reader, touch/mobile or cross-browser claim is made. Automated Canvas-free rendering is not substituted for these checks.

## Remaining limitations

- One desktop/browser/hardware environment and one 20-second capture per workload; no mobile, cross-browser or repeated-trial performance claim. Residual rush/incident long tasks remain.
- rAF cadence is not unique Canvas redraw FPS. Frame timing is now measured through the app's development instrumentation, not arbitrary browser script evaluation.
- Forecast snapshots and structured cloning still cost main-thread time; large-load bounded copies can remain a future optimization target. No architecture rewrite without further measurements.
- Terminal hold cost prices a known minimum obligation only; it does not claim full clearance or remove every finite-horizon policy effect. Long-tail active trips and censored clearance remain a model limitation.
- Pacing samples are counterfactuals on no-action trajectories, with five-minute sampling and only the two UI action types/bridges. They do not replace human playtesting, accessibility/screen-reader or mobile audits.
