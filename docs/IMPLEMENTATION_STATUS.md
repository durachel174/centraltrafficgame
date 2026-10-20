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
| 6 Metrics | COMPLETE | Objective includes completed and active travel time, waiting delay, dissatisfaction, congestion, and kilometer-based excess distance. Baseline objective is computed in UI. |
| 7 Forecasting | COMPLETE | Forecasts use cloned no-action forward rollouts at +5/+10/+15 minutes with configurable alert thresholds and actual elapsed horizon labels near scenario end. |
| 8 Player Actions | IN PROGRESS | Reroute, route-based waiting holds, release, explicit Preview → Review → Apply/Cancel are implemented with session-safe caching and worker execution. Hover/focus only explains controls; normal play and tutorial share consequence review. The action-driven tutorial and practice checkpoint demonstrate a real North Bridge reroute and South Bridge spillover in automated tests and browser checks. Help is safe for active runs and tutorial recovery handles cancel, road changes, reset, failed previews, and unusable previews. Full browser FPS measurement still needs tooling that exposes animation timing. |
| 9 Scenario | IN PROGRESS | Monday Morning runs 7:00-9:00 with the 8:12 incident and scenario-specific final results. Practice has separate restart/start-Monday actions without a competitive score. Both report unfinished trips. Placeholder decision commentary and invented ratings have been removed. |
| 10 Headless Environment | COMPLETE | `TrafficEnvironment`, baseline/reactive controllers, `npm run simulate`, replay support, and benchmark script are implemented. |
| 11 Logging/Replay | COMPLETE | Action logs deep-copy actions, forecast samples, and snapshots; replay reproduces final metrics, and snapshot round trips preserve deterministic future outcomes. |
| 12 Polish | IN PROGRESS | The player interface is now map-first with three primary indicators, plain-language inspector copy, safe Help with explicit tutorial replay confirmation, an action-driven skippable tutorial stored in `localStorage`, a dedicated practice checkpoint, gradual control reveal, contextual highlighting, production-hidden debug controls, measured observation summaries, and baseline improvement hidden until scenario finish. Browser FPS still needs real-browser verification. |

## Remaining Limitations

- Forecasts are truthful deterministic rollouts, but they are still aggregate macroscopic network forecasts rather than microscopic driver behavior.
- Browser FPS and responsiveness measurements are tracked separately from headless benchmarks.
- Browser previews run in a Web Worker; real development and production worker loading has been checked. A true FPS measurement remains unverified.
- The practice tutorial checkpoint is warmed forward from the deterministic seed before play begins so the first preview has visible measured consequences.
- The in-app browser automation verifies worker previews and interaction state, but does not expose `requestAnimationFrame`/`performance` for a true FPS measurement.
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
