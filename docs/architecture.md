# Architecture

The simulation engine is independent from React and rendering.

```ts
const sim = new SimulationEngine(config);
sim.reset(seed);
sim.step(action);
const state = sim.getState();
const reward = sim.getReward();
```

React creates serializable `SimulationAction` objects and reads observations. Canvas rendering consumes graph and vehicle state but does not update traffic.

## State Boundaries

The engine owns all mutable authoritative simulation state. Browser forecast presentation is a separate store cache. Public observations, run exports, alerts, forecasts, nested forecast samples, snapshots, and UI-facing state are returned as copies so callers cannot mutate the live engine accidentally. React sends the same serializable action objects that a future controller can send.

Forecasts and action previews use serializable engine snapshots. The snapshot includes scenario/configuration, graph state, vehicles, waiting trips, RNG state, demand-generator carry/id state, active events, temporary capacity reductions, metrics, logs, and cached forecast metadata. Rollout clones disable nested forecasting so a forecast cannot recursively forecast itself or perturb the live RNG/log.

`step(action)` uses `reward = previousObjective - currentObjective`, stores that reward, and `getReward()` returns the latest step reward. Calling `step` after the scenario is done is a no-op that returns `done: true`.

## Preview UI

React does not call `previewAction` while rendering. The game store computes previews only after an explicit request, caches them by simulation session, revision, and serialized action, and pauses the simulation while the player reviews the result. If the simulation session or revision changes before a preview returns, the result is discarded or marked stale and cannot be applied. Apply executes the exact reviewed action once; Cancel clears the preview without changing the engine.

Browser preview rollout work runs in `src/workers/previewWorker.ts`, which restores the serializable snapshot into `SimulationEngine` and calls the same synchronous `previewAction` method used by headless tests and scripts. Worker failures surface as an error with Retry instead of silently falling back to a blocking main-thread calculation. Obsolete workers are terminated when a request is canceled, superseded, reset, or invalidated by road selection.


## Challenge sessions

`GameStore` owns the selected seed, worker baseline lifecycle, replay action source, decision history, incident transition notice, completed run, and staged file import. Session changes invalidate preview requests/cache and terminate preview/baseline workers; history, notices, imports, results, and tutorial/replay state reset together. Baseline caches are compatible by full identity and seed and bounded to eight entries. Main-thread computation never substitutes for unavailable baseline/preview workers.

`ScenarioProgress` derives stage and incident presentation from scenario progression configuration, simulated time, and actual active event IDs. Monday-specific progression configuration lives in the Monday scenario. No new Monday-specific control rules live in `SimulationEngine`. Event processing still follows the original interval-start convention. The first post-activation observation is at 08:12:15; the restored-capacity observation is at 08:27:15. The affected intervals start at the configured 08:12 and 08:27 boundaries. A stable transition notice is separate from the persistent remaining-duration status, so pause/rerender does not repeatedly announce the incident.

The scoring layer exposes a copied structured weighted breakdown alongside the total. Phase 12 adds a separate terminal hold liability for Monday Morning using the existing departure-delay weight, without changing traffic physics. Engine logs add the actual executed affected count. Decision history reads those logs after execution, outside rendering; previews do not add history.

`RunFile` validates version/configuration compatibility and local files. `Replay` supplies the shared interval-end action lookup used by headless replay and the interactive store. The store guards live actions at the action-source boundary as well as disabling UI intervention buttons. At scenario end, verification compares all metrics and the canonical deterministic final-state checksum. Only a checksum, not a snapshot per tick, is stored in the file. Details are in [replay.md](replay.md).


## Browser forecast scheduling (Phase 12)

The browser creates `SimulationEngine(config, timingCallback, true)`: the third runtime argument disables only automatic in-engine forecast refresh. It is not serialized and does not change ticks, metrics, RNG or actions. The default headless engine still refreshes synchronously. `calculateForecasts()` and `forecastWorker.ts` use the same deterministic rollout from the identical source snapshot; clones disable nested forecasting.

`ForecastScheduler` owns one persistent worker, one active request and one pending bit. No queue of snapshots accumulates. A due refresh uses the latest snapshot when dispatched. Requests/responses carry request ID, session, invalidation epoch, revision and source simulation time. Reset, seed/scenario change, applied action and actual incident-state transitions terminate/invalidate old requests. Worker failures expose Retry; no synchronous browser fallback blocks play. Completion updates only the presentation cache, never the engine.

A result from an earlier revision is usable only within one configured refresh interval (5 simulated minutes for Monday). Source time cannot be in the future. Expired samples/results disappear; actual sample horizons are rebased by current source age, including near-end truncation. A valid cached result may stay visible during ordinary refresh with its honest age. Invalidating actions/events clear it immediately. Late session/epoch responses are rejected. App initialization requests the first forecast; replay follows the same presentation path without affecting verification.

Development-only timing uses optional callbacks outside authoritative state and bounded 4096-sample per-metric buffers. Capture is opt-in, stops after 20 seconds, observes supported long tasks and rAF, and sends nothing. Engine clones do not inherit timing callbacks. Production passes no recorder callback or capture UI. Snapshot preparation and `postMessage` main-thread structured-clone posting are measured separately from worker runtime and end-to-end latency.
