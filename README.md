# Central Traffic

A playable browser-based traffic strategy simulation. The React UI observes a deterministic TypeScript simulation engine and emits serializable player actions, so the same simulator can run in-browser, headlessly, by heuristic controllers, and later by ML controllers.

## Commands

```bash
npm install
npm run dev
npm test
npm run build
npm run simulate -- --runs=10 --controller=reactive
npm run benchmark
```

## Architecture

- `src/simulation`: deterministic, render-independent traffic engine.
- `src/components`: React control-center UI.
- `src/rendering`: canvas drawing only, no simulation logic.
- `scripts/simulate.ts`: headless runs for baseline/reactive controllers.
- `scripts/benchmark.ts`: 5,000 vehicle tick, forecast, and preview benchmark.

## Scoring

The objective includes completed travel time plus elapsed travel time for active vehicles, so unfinished trips remain costly. Waiting trips accrue departure delay once per simulated minute while waiting, including held trips and trips with no available route. Passenger dissatisfaction is estimated for waiting and active passengers and finalized on arrival.

Excess distance is measured in kilometers. The baseline is the free-flow fastest route, using each edge's base travel time, and the score compares the current or completed route distance against that baseline distance. At scenario end, unfinished trips still contribute elapsed travel time, accumulated departure delay, dissatisfaction, and planned excess distance.

Forecasts and action previews are deterministic no-further-intervention rollouts from the current state. A preview compares two identical-future simulations: no action versus the proposed action. Positive `networkCostDelta` and `averagePassengerDelayDelta` are worse; positive `satisfactionDelta` is better.

## Tick Convention

Each simulation step covers `[time, time + 0.25]` simulated minutes. Player actions, event state, dispatch, and movement use the interval start. Newly generated mathematical demand is added at the interval end, so a generated trip cannot move before its recorded departure time. Arrivals are timestamped within the interval and never after the current simulation time reported at the end of the step.

## Preview Flow

Road previews are calculated only after the player requests one. The game pauses while reviewing a preview, caches results by simulation revision and action parameters, and marks a preview stale if the simulation advances. Confirm applies the exact reviewed action once; Cancel changes nothing. Preview delay fields are passenger-minutes total and minutes per passenger over the same branch cohort.
