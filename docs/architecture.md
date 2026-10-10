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

The engine owns all mutable simulation state. Public observations, run exports, alerts, forecasts, and UI-facing state are returned as copies so callers cannot mutate the live engine accidentally. React sends the same serializable action objects that a future controller can send.

Forecasts and action previews use cloned internal snapshots. The snapshot includes graph state, vehicles, waiting trips, RNG state, demand-generator carry/id state, active events, temporary capacity reductions, metrics, logs, and cached forecast metadata. Rollout clones disable nested forecasting so a forecast cannot recursively forecast itself or perturb the live RNG/log.

`step(action)` uses `reward = previousObjective - currentObjective`, stores that reward, and `getReward()` returns the latest step reward. Calling `step` after the scenario is done is a no-op that returns `done: true`.

## Preview UI

React does not call `previewAction` while rendering. The game store computes previews only after an explicit request, caches them by simulation revision plus serialized action, and pauses the simulation while the player reviews the result. If the simulation revision changes before a preview returns, the result is marked stale and cannot be confirmed. Confirm applies the exact reviewed action once; Cancel clears the preview without changing the engine.

Preview rollout work currently runs asynchronously through the store rather than in a dedicated Web Worker. The traffic logic remains in `SimulationEngine`; the UI does not duplicate traffic calculations.
