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

The engine owns all mutable simulation state. Public observations, run exports, alerts, forecasts, nested forecast samples, snapshots, and UI-facing state are returned as copies so callers cannot mutate the live engine accidentally. React sends the same serializable action objects that a future controller can send.

Forecasts and action previews use serializable engine snapshots. The snapshot includes scenario/configuration, graph state, vehicles, waiting trips, RNG state, demand-generator carry/id state, active events, temporary capacity reductions, metrics, logs, and cached forecast metadata. Rollout clones disable nested forecasting so a forecast cannot recursively forecast itself or perturb the live RNG/log.

`step(action)` uses `reward = previousObjective - currentObjective`, stores that reward, and `getReward()` returns the latest step reward. Calling `step` after the scenario is done is a no-op that returns `done: true`.

## Preview UI

React does not call `previewAction` while rendering. The game store computes previews only after an explicit request, caches them by simulation session, revision, and serialized action, and pauses the simulation while the player reviews the result. If the simulation session or revision changes before a preview returns, the result is discarded or marked stale and cannot be confirmed. Confirm applies the exact reviewed action once; Cancel clears the preview without changing the engine.

Browser preview rollout work runs in `src/workers/previewWorker.ts`, which restores the serializable snapshot into `SimulationEngine` and calls the same synchronous `previewAction` method used by headless tests and scripts. Worker failures surface as an error with Retry instead of silently falling back to a blocking main-thread calculation. Obsolete workers are terminated when a request is canceled, superseded, reset, or invalidated by road selection.
