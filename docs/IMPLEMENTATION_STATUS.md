# Implementation Status

Assessment against the original phased acceptance conditions.

| Phase | Status | Notes |
| --- | --- | --- |
| 0 Project Foundation | COMPLETE | Vite, React, TypeScript, Vitest, README, build/test scripts, and simulator/UI separation exist. |
| 1 Graph | COMPLETE | Nodes, directed edges, graph, seeded RNG, and Dijkstra routing are implemented and tested. |
| 2 Traffic Simulator | COMPLETE | Fixed timestep, trips, vehicles, congestion-dependent movement, arrivals, and deterministic behavior are implemented. |
| 3 Two-Bridge City | COMPLETE | Fictional Bay-like city includes North and South bridges with route alternatives and emergent route switching. |
| 4 Visualization | COMPLETE | Canvas renders a map-first city view with districts, water, roads, traffic intensity, affected-road highlighting, vehicles, clock, and speed controls. |
| 5 Demand | COMPLETE | Monday Morning demand is generated mathematically from a time curve and OD weights. |
| 6 Metrics | COMPLETE | Objective includes completed and active travel time, waiting delay, dissatisfaction, congestion, and kilometer-based excess distance. A compatible baseline and weighted cost components are calculated in a dedicated browser worker. |
| 7 Forecasting | COMPLETE | Forecasts use cloned no-action forward rollouts at +5/+10/+15 minutes with configurable alert thresholds and actual elapsed horizon labels near scenario end. |
| 8 Player Actions | IN PROGRESS | Reroute, route-based waiting holds, release, explicit Preview → Review → Apply/Cancel are implemented with session-safe caching and worker execution. Hover/focus only explains controls; normal play and tutorial share consequence review. The action-driven tutorial and practice checkpoint demonstrate a real North Bridge reroute and South Bridge spillover in automated tests and browser checks. Help is safe for active runs and tutorial recovery handles cancel, road changes, reset, failed previews, and unusable previews. Desktop frame cadence and worker latency were measured in the Phase 12 milestone. |
| 9 Scenario | COMPLETE | Monday Morning is a full 07:00–09:00 challenge with configuration-driven progression, 08:12 incident and 08:27 restoration feedback, actual decision history, weighted final/baseline comparisons, identical/new-seed retries, completed local JSON export/import, and guarded replay with final log/metrics/state verification. Practice remains distinct. All Phase 9 tests and actual development/production completed-run/file/replay checks passed; see [validation evidence](PHASE9_VALIDATION.md). |
| 10 Headless Environment | COMPLETE | `TrafficEnvironment`, baseline/reactive controllers, `npm run simulate`, replay support, and benchmark script are implemented. |
| 11 Logging/Replay | COMPLETE | Action logs deep-copy actions, forecast samples, and snapshots; replay reproduces final metrics, and snapshot round trips preserve deterministic future outcomes. |
| 12 Polish | IN PROGRESS | The player interface is now map-first with three primary indicators, plain-language inspector copy, safe Help with explicit tutorial replay confirmation, an action-driven skippable tutorial stored in `localStorage`, a dedicated practice checkpoint, gradual control reveal, contextual highlighting, production-hidden debug controls, measured observation summaries, and baseline improvement hidden until scenario finish. Phase 12 adds measured forecast offloading, truthful source age/horizons, and ten-seed scoring/pacing audits; see current validation below. |

## Remaining Limitations

- Forecasts are truthful deterministic rollouts, but they are still aggregate macroscopic network forecasts rather than microscopic driver behavior.
- Browser rAF/long-task and responsiveness measurements are tracked separately from headless benchmarks; single desktop captures do not establish cross-device performance.
- Browser previews and scheduled forecasts run in separate workers; actual development/production loading and desktop rAF cadence were measured. Residual rush/incident long tasks remain.
- The practice tutorial checkpoint is warmed forward from the deterministic seed before play begins so the first preview has visible measured consequences.
- Development-only in-app instrumentation now exposes bounded rAF/long-task and worker timing reports; rAF cadence does not mean unique Canvas redraw FPS.
- The reactive controller is intentionally simple and is not tuned to guarantee better results than baseline.
- Disrupt mode and ML training are type-level architecture only, not gameplay.

## Accuracy And Preview Fixes

- Tick timing, nonnegative durations, reset clearing, immutable logs/actions/forecast samples, route-based holds, preview cache sessions, worker parity, configurable preview horizons, actual-vs-requested horizon labels, near-end truncation de-duplication, and selected-road preview labeling are covered by regression tests.
- The hold action affects currently eligible waiting trips whose current fastest route traverses the selected road. It does not apply to future demand.
- Preview cache keys include a session/generation id, simulation revision, and serialized action. Reset clears the cache and invalidates pending worker responses.


## Explicit action review milestone (2026-10-19)

- Hover/focus never requests rollouts or changes playback; Preview buttons pause and calculate, and never become Apply buttons. Ready review exposes Apply and Cancel. Cancel leaves engine state and action logs unchanged and offers Resume while paused.
- One review component serves normal play and tutorial, including action parameters, actual affected count, selected-road utilization, ranked distinct alternative roads, passenger-minutes total, minutes per rider average, satisfaction percentage points, and system-cost delta labeled lower-is-better. All horizons are available in expandable details; actual projection time, scenario-end truncation, and no-further-intervention assumptions remain visible.
- Apply consumes the reviewed action once with session/revision guards. Tutorial observation begins after execution. Cancel, Skip, Help, reset, wrong-road selection, failed previews, and zero-affected previews retain recovery paths.
- Simulation, scoring, routing, demand, worker calculation protocol, and replay implementation are unchanged.
- Validation: `npm test` passes all 84 tests; `npm run build` passes. Existing tests retained; interaction regressions cover no-work hover/focus, explicit preview/apply/cancel, stale rejection, Retry, shared tutorial flow, summary ranking/units, results actions, and real final unfinished counts. JSDOM Canvas warnings are expected and simulated workers are not browser evidence.

### Browser validation

Actual in-app browser checks use the development server at localhost:5173 and the built production server at 127.0.0.1:4173. Real worker responses were observed on both builds, including unfavorable cost/satisfaction effects and South Bridge spillover. Development checks include guided Preview/Cancel/retry/Apply/observation, free practice, keyboard focus preserving 4x playback, Help return, practice completion and Start Monday, Monday completion and restart. Production checks include Skip, normal-play reroute/hold reviews, Cancel, Apply, stale review after resumed playback, Retry using the real worker, Help, reset, keyboard focus preserving 4x playback, keyboard Preview activation, actual Practice and Monday completion, and Practice Again/Run Again restart actions.

Desktop layout checks include 1280×720 and 1440×900. The inspector scrolls to accommodate full review; additional horizons remain collapsed by default. Screenshots: [action review](screenshots/action-review.jpg), [Monday results](screenshots/monday-results.jpg), and [practice results](screenshots/practice-results.jpg).

Remaining browser limitations: pointer hover could not be independently driven by the available automation API (covered by UI event tests); forced worker-error Retry is tested in JSDOM only (stale Retry was checked in-browser). No FPS measurement, screen-reader audit, or mobile-layout claim is made.


## Phase 9 challenge milestone (2026-10-19)

- Completed the existing Monday Morning systems rather than replacing simulation physics, scoring weights, routing, mathematical demand, worker previews, or the action-driven tutorial.
- Configuration/time/active-event state drive restrained stage and incident status. Actual capacity restoration is distinct from traffic clearing. A stable transition notice is separate from the remaining-duration display and resets with the session.
- Applied interventions record actual affected counts and immediate tick cost change, including tick evolution. Canceled previews add no history. No unsupported best/worst attribution is made.
- Results explain completed-trip travel statistics, unfinished waiting/active trips, weighted objective components, and compatible no-intervention baseline components. Baseline work is off-thread, keyed by engine/scenario/configuration/seed and protected against obsolete results, with Retry instead of a blocking fallback.
- Try This Seed Again, New Seed, Watch Replay, completed local export/import, replay pause/speed/restart, strict validation, and final executed-log/metrics/state verification are implemented. Engine/run/scenario compatibility and one-action-per-tick semantics are explicit in [replay documentation](replay.md).
- Validation: **97 tests passed**, build passed, ten baseline and ten reactive runs completed, and benchmark completed via the documented `node --import tsx` fallback after a tsx CLI IPC restriction. Actual development and production Canvas/worker/file-picker/download/replay checks passed, including a full new-seed round and verified replay.
- Full commands, controller comparisons, measurements, browser details, screenshots, and remaining verification limits are recorded in [Phase 9 validation](PHASE9_VALIDATION.md). Browser FPS remains unmeasured; no headless or mocked-worker test is represented as browser evidence.


## Phase 12 performance and balancing milestone (2026-10-19)

**IN PROGRESS.** [Phase 12 validation](PHASE12_VALIDATION.md) supersedes earlier statements that browser frame timing was unavailable. Instrumentation was committed before optimization; actual 20-second desktop captures cover normal 1×/4×, rush, incident, preview and 5,000+ active vehicles. Before, high-load forecasts produced repeated main-thread long tasks; after offloading, high-load worst rAF gap improved 143.2→42.6 ms and observed long tasks 13→0. Rush/incident retain one long task each. Bounded opt-in local recording is absent from normal production play.

Scheduled browser forecasts now use a coalesced worker, source session/revision/time and invalidation epoch, one-interval freshness limit, truthful age and rebased remaining horizons. Actions/events and session resets invalidate obsolete results. Headless forecasting stays synchronous. Derived forecast scheduling is outside authoritative state/checksums; preview and replay behavior is preserved.

Ten paired seeds across eight policies and a controlled short/day hold witness proved unpriced imposed waiting beyond 09:00. Monday version 2 now charges that remaining known obligation separately using the existing departure-delay weight; observed waiting is not double-counted. Results/near-end previews distinguish the terminal liability. Engine 0.3.0 rejects old incompatible files. No demand/capacity/routing tuning was justified. Pacing counterfactuals show available consequential choices, including harmful ones; no cooldowns or scripted traffic changes were added.

Validation: **108 tests**, production build, ten baseline and ten reactive runs, benchmark (documented tsx IPC fallback), scoring/hold/pacing audits passed. Actual current development/production workers, tutorial, explicit action review, resets/new seed, completed local export/import and verified replay were checked; detailed evidence and limitations are in the validation document. Mobile, screen-reader and broader accessibility audits, human pacing sessions, cross-browser/repeated performance trials, residual main-thread tasks and unfinished active-trip clearance modeling remain unresolved.


## Desktop beta preparation follow-up (2026-10-19)

**Phase 12 IN PROGRESS; human participant outcomes pending.** Desktop keyboard paths now include a compact native road selector, focusable labelled forecast, explicit inline Preview/Review/Apply/Cancel, safe Escape cancellation, guided tutorial focus and focus recovery after async Retry controls disappear. Shared Help/results/import/tutorial-confirmation modals provide focus entry, Tab containment, inert backgrounds and safe dismissal/restoration. Stable status announcements exclude ordinary ticks. Visible focus and text/pattern traffic indicators complement color; reduced-motion preferences hide moving markers without changing traffic or playback.

The new `audit:endgame` command ran fourteen policies on ten paired seeds with capped four-hour post-demand diagnostics. Capped rankings sometimes reverse, but no run fully clears. This leaves residual horizon sensitivity unresolved, rather than proving scoring fair or justifying a new arbitrary penalty. Engine 0.3.0 / Monday Morning 2 and compatible export/replay semantics are preserved.

Validation: **121 tests** (all prior tests retained), build, paired baseline/reactive simulations, benchmark with allowed tsx IPC fallback, and 140-run audit. Actual development/production keyboard tutorial, modal focus/containment/restore, real workers, results/files and verified stress replay were checked. Measured residual spikes remain variable; no speculative performance optimization or speedup claim. Full evidence and verification limits: [Phase 12 validation](PHASE12_VALIDATION.md). Human test protocol: [DESKTOP_PLAYTEST.md](DESKTOP_PLAYTEST.md).

Remaining desktop-beta acceptance work includes real participant sessions, screen-reader and cross-browser testing, repeated performance traces and unfinished-trip residual modeling. Mobile is outside this milestone. Automated DOM/contrast checks and Chromium keyboard checks are not a WCAG certification or evidence of player comprehension.
