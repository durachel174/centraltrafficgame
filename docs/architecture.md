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

`step(action)` uses `reward = previousObjective - currentObjective`, stores that reward, and `getReward()` returns the latest step reward. Calling NO_OP `step` after evaluation is done is a no-op that returns `done: true`. Non-NO_OP commands outside the decision phase return an explicit `info.actionRejected` without changing time, logs or state.

## Preview UI

React does not call `previewAction` while rendering. The game store computes previews only after an explicit request, caches them by simulation session, revision, and serialized action, and pauses the simulation while the player reviews the result. If the simulation session or revision changes before a preview returns, the result is discarded or marked stale and cannot be applied. Apply executes the exact reviewed action once; Cancel clears the preview without changing the engine.

Browser preview rollout work runs in `src/workers/previewWorker.ts`, which restores the serializable snapshot into `SimulationEngine` and calls the same synchronous `previewAction` method used by headless tests and scripts. Worker failures surface as an error with Retry instead of silently falling back to a blocking main-thread calculation. Obsolete workers are terminated when a request is canceled, superseded, reset, or invalidated by road selection.


## Challenge sessions

`GameStore` owns the selected seed, worker baseline lifecycle, replay action source, decision history, incident transition notice, completed run, and staged file import. Session changes invalidate preview requests/cache and terminate preview/baseline workers; history, notices, imports, results, and tutorial/replay state reset together. Baseline caches are compatible by full identity and seed and bounded to eight entries. Main-thread computation never substitutes for unavailable baseline/preview workers.

`ScenarioProgress` derives stage and incident presentation from scenario progression configuration, simulated time, and actual active event IDs. Monday-specific progression configuration lives in the Monday scenario. No new Monday-specific control rules live in `SimulationEngine`. Event processing still follows the original interval-start convention. The first post-activation observation is at 08:12:15; the restored-capacity observation is at 08:27:15. The affected intervals start at the configured 08:12 and 08:27 boundaries. A stable transition notice is separate from the persistent remaining-duration status, so pause/rerender does not repeatedly announce the incident.

The scoring layer exposes a copied structured weighted breakdown alongside the total. The current full-clearance evaluator realizes waiting/travel and travelled excess distance. A historical remaining-hold estimate is retained only in the cutoff checkpoint, never added to final realized cost. Engine logs add the actual executed affected count. Decision history reads those logs after execution, outside rendering; previews do not add history.

`RunFile` validates version/configuration compatibility and local files. `Replay` supplies the shared interval-end action lookup used by headless replay and the interactive store. The store guards live actions at the action-source boundary as well as disabling UI intervention buttons. At scenario end, verification compares all metrics and the canonical deterministic final-state checksum. Only a checksum, not a snapshot per tick, is stored in the file. Details are in [replay.md](replay.md).


## Browser forecast scheduling (Phase 12)

The browser creates `SimulationEngine(config, timingCallback, true)`: the third runtime argument disables only automatic in-engine forecast refresh. It is not serialized and does not change ticks, metrics, RNG or actions. The default headless engine still refreshes synchronously. `calculateForecasts()` and `forecastWorker.ts` use the same deterministic rollout from the identical source snapshot; clones disable nested forecasting.

`ForecastScheduler` owns one persistent worker, one active request and one pending bit. No queue of snapshots accumulates. A due refresh uses the latest snapshot when dispatched. Requests/responses carry request ID, session, invalidation epoch, revision and source simulation time. Reset, seed/scenario change, applied action and actual incident-state transitions terminate/invalidate old requests. Worker failures expose Retry; no synchronous browser fallback blocks play. Completion updates only the presentation cache, never the engine.

A result from an earlier revision is usable only within one configured refresh interval (5 simulated minutes for Monday). Source time cannot be in the future. Expired samples/results disappear; actual sample horizons are rebased by current source age, including near-end truncation. A valid cached result may stay visible during ordinary refresh with its honest age. Invalidating actions/events clear it immediately. Late session/epoch responses are rejected. App initialization requests the first forecast; replay follows the same presentation path without affecting verification.

Development-only timing uses optional callbacks outside authoritative state and bounded 4096-sample per-metric buffers. Capture is opt-in, stops after 20 seconds, observes supported long tasks and rAF, and sends nothing. Engine clones do not inherit timing callbacks. Production passes no recorder callback or capture UI. Snapshot preparation and `postMessage` main-thread structured-clone posting are measured separately from worker runtime and end-to-end latency.


## Desktop keyboard layer

`Modal` maintains a shared stack for Help, results and nested confirmations. It isolates sibling branches along the active dialog's DOM path with inert/aria-hidden, restores prior attributes on close, contains focus and keyboard activation, and restores the origin/fallback. Async control replacement returns lost focus to the active dialog. Results intentionally have no Escape dismissal. The same inline preview component handles normal/tutorial keyboard activation; it uses existing store APIs, returns focus after Apply/Cancel and preserves selector focus when changing roads. Tutorial transitions guide focus to controls/forecast/review instead of making the whole tutorial modal. These are presentation behaviors outside deterministic state and worker scheduling.

The native road selector shares `selectedEdgeId` with Canvas and alerts. Reduced-motion preference only suppresses moving Canvas markers; it neither steps nor pauses the engine. Stable action/status announcements are separate from changing clock, forecast-age and metric fields. `finalizeRun` is an additional bounded development capture metric around completed-run construction/replay verification; no instrumentation is recorded during normal production play.

## Decision, clearance and finish contract (0.5.0)

`Scenario.endTime` is the decision/demand cutoff. Optional `evaluation.maxClearanceMinutes` enables post-demand evaluation; Monday uses 240, practice omits it. The engine contains no Monday-specific clock rules. `decisionsOpen()` gates intervention and generation; `isDone()` means evaluation finished. The last decision interval still appends demand at the cutoff, while subsequent ticks generate nothing. Stored holds/events/queues/restrictions continue unchanged. No arrivals or passengers are forced/deleted.

`getEvaluation()` is a copied serializable value: phase, absolute decision cutoff, elapsed clearance, configured maximum, absolute evaluation limit, finish reason and actual end-tick finish time. It also appears in observations and step info; `TrafficEnvironment` exposes it directly. Phase derives unambiguously from scenario, time and trip state. Snapshot 3 stores `decisionCutoffMetrics` separately; the getter returns a copy. Finish is `all-arrived` or `safety-limit` for clearance-enabled scenarios; fixed-window practice uses `decision-window-ended`. The end tick can include a fractional within-tick arrival timestamp in vehicle statistics.

At the exact boundary, the store pauses, cancels previews/cache, invalidates forecast epochs and focuses the nonmodal clearance region. Playback groups stop when a step pauses, so 4x cannot overrun the transition. `TickBatchRunner` calls the same live `GameStore.step()` in batches of at most eight ticks and an eight-ms checked budget, yielding through timers. One indivisible tick/final checksum may exceed that budget. It never restores a diagnostic engine or replaces progress with worker output. Cancel, Pause, Help, reset and scenario/seed changes stop scheduling; a captured session token prevents obsolete callbacks from advancing a new run. Completed ticks remain authoritative.

Forecasts are suspended/cleared during fast-forward and refreshed from the current source when watching resumes. Phase transitions/reset/fast-forward invalidate old workers by epoch/session. Baseline workers skip unused nested forecasts but use identical authoritative evaluation settings and return finish metadata and cutoff metrics. Results compare only matching complete evaluations. Replay uses recorded actions only through the cutoff and NO_OP ticks throughout clearance, including bounded fast-forward; it verifies checkpoint, evaluation metadata, final metrics, logs and checksum. See [replay format](replay.md) and [measurements](POST_DEMAND_EVALUATION.md).
