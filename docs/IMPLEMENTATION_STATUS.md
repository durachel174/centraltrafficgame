# Implementation Status

Assessment against the original phased acceptance conditions.

| Phase | Status | Notes |
| --- | --- | --- |
| 0 Project Foundation | COMPLETE | Vite, React, TypeScript, Vitest, README, build/test scripts, and simulator/UI separation exist. |
| 1 Graph | COMPLETE | Nodes, directed edges, graph, seeded RNG, and Dijkstra routing are implemented and tested. |
| 2 Traffic Simulator | COMPLETE | Fixed timestep, trips, vehicles, congestion-dependent movement, arrivals, and deterministic behavior are implemented. |
| 3 Two-Bridge City | COMPLETE | Fictional Bay-like city includes North and South bridges with route alternatives and emergent route switching. |
| 4 Visualization | COMPLETE | Canvas renders map, roads, traffic intensity, vehicles, clock, and speed controls. |
| 5 Demand | COMPLETE | Monday Morning demand is generated mathematically from a time curve and OD weights. |
| 6 Metrics | COMPLETE | Objective includes completed and active travel time, waiting delay, dissatisfaction, congestion, and kilometer-based excess distance. Baseline objective is computed in UI. |
| 7 Forecasting | COMPLETE | Forecasts use cloned no-action forward rollouts at +5/+10/+15 minutes with configurable alert thresholds and actual elapsed horizon labels near scenario end. |
| 8 Player Actions | IN PROGRESS | Reroute, route-based waiting holds, release, preview, Confirm, and Cancel are implemented with session-safe caching and worker execution. The full forecast -> preview -> confirm -> network-consequence interaction still needs browser FPS/responsiveness verification. |
| 9 Scenario | IN PROGRESS | Monday Morning runs 7:00-9:00 with the 8:12 incident and end screen. Best/worst decision labels remain heuristic placeholders. |
| 10 Headless Environment | COMPLETE | `TrafficEnvironment`, baseline/reactive controllers, `npm run simulate`, replay support, and benchmark script are implemented. |
| 11 Logging/Replay | COMPLETE | Action logs deep-copy actions, forecast samples, and snapshots; replay reproduces final metrics, and snapshot round trips preserve deterministic future outcomes. |
| 12 Polish | IN PROGRESS | Preview responsiveness polish is underway: rendering no longer triggers previews, worker previews are explicit/cached/stale-guarded/confirmable, errors are visible, and obsolete workers are cleaned up. Browser FPS still needs real-browser verification. |

## Remaining Limitations

- Forecasts are truthful deterministic rollouts, but they are still aggregate macroscopic network forecasts rather than microscopic driver behavior.
- Browser FPS and responsiveness measurements are tracked separately from headless benchmarks.
- Browser previews now run in a Web Worker; playable checkpoint completion depends on real-browser preview and FPS verification.
- The reactive controller is intentionally simple and is not tuned to guarantee better results than baseline.
- Disrupt mode and ML training are type-level architecture only, not gameplay.

## Accuracy And Preview Fixes

- Tick timing, nonnegative durations, reset clearing, immutable logs/actions/forecast samples, route-based holds, preview cache sessions, worker parity, configurable preview horizons, actual-vs-requested horizon labels, near-end truncation de-duplication, and selected-road preview labeling are covered by regression tests.
- The hold action affects currently eligible waiting trips whose current fastest route traverses the selected road. It does not apply to future demand.
- Preview cache keys include a session/generation id, simulation revision, and serialized action. Reset clears the cache and invalidates pending worker responses.
