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

## Player Flow

The default interface is map-first: the city canvas, three main indicators, and the selected-road inspector stay visible while lower-level diagnostics stay out of the way. First-time players start in a skippable practice checkpoint that is paused on North Bridge pressure. The tutorial is stored in `localStorage` and advances through real actions: select North Bridge, request a reroute preview, review the measured tradeoff, apply or cancel, resume time, and watch the observed result.

Help opens as a safe in-game panel. It explains the controls without replacing the current run, and replaying the tutorial requires a separate Start Practice confirmation because it starts a fresh practice session. The tutorial recovers if the player cancels, changes roads, resets, or receives an unusable preview.

The practice scenario is a verified checkpoint warmed forward from its seed so a North Bridge reroute produces a measured selected-road change and real South Bridge spillover. It is not a separate ruleset; it uses the same deterministic engine, forecast labels, preview worker path, route changes, and replay/action logging as normal play. Post-action tutorial feedback reports observed start-to-end bridge counts and elapsed simulated time, and keeps those observations separate from projected preview effects.

Development-only spawn and incident controls are available only in Vite development builds. Production builds do not render the Dev toggle or `DebugPanel`.

## Architecture

- `src/simulation`: deterministic, render-independent traffic engine.
- `src/components`: React control-center UI.
- `src/rendering`: canvas drawing only, no simulation logic.
- `scripts/simulate.ts`: headless runs for baseline/reactive controllers.
- `scripts/benchmark.ts`: 5,000 vehicle tick, forecast, and preview benchmark.

## Scoring

The objective includes completed travel time plus elapsed travel time for active vehicles, so unfinished trips remain costly. Waiting trips accrue departure delay once per simulated minute while waiting, including held trips and trips with no available route. Passenger dissatisfaction is estimated for waiting and active passengers and finalized on arrival.

Excess distance is measured in kilometers. The baseline is the free-flow fastest route, using each edge's base travel time, and the score compares the current or completed route distance against that baseline distance. At scenario end, unfinished trips still contribute elapsed travel time, accumulated departure delay, dissatisfaction, and planned excess distance.

Forecasts and action previews are deterministic no-further-intervention rollouts from the current state. A preview compares two identical-future simulations: no action versus the proposed action. Positive `networkCostDelta` and passenger delay deltas are worse; positive `satisfactionDelta` is better. The UI shows baseline improvement only after a scenario finishes so it does not compare an unfinished player run against a completed baseline.

## Tick Convention

Each simulation step covers `[time, time + 0.25]` simulated minutes. Player actions, event state, dispatch, and movement use the interval start. Newly generated mathematical demand is added at the interval end, so a generated trip cannot move before its recorded departure time. Arrivals are timestamped within the interval and never after the current simulation time reported at the end of the step.

## Preview Flow

Road previews are calculated only after the player requests one. In the browser, expensive preview rollouts run in a dedicated Web Worker from a serializable engine snapshot. Hover and keyboard focus show an explanation only and preserve playback speed. Clicking **Preview Reroute** or **Preview Hold** explicitly pauses time and requests a calculation. The original card always remains a Preview control. A shared review for normal play and tutorial has separate **Apply** and **Cancel** buttons. Apply executes the exact reviewed action once, guarded by session and revision. Cancel changes no engine state or logs and offers **Resume 1x** while paused.

Results are cached by session, revision, and action parameters. Playback makes a review stale; changing roads dismisses it. Retry recomputes stale or failed previews. Reset invalidates pending responses and cached results; Help stops pending workers. The review shows the actual affected count, selected-road utilization, passenger-delay delta in **passenger-minutes** and **minutes per rider**, satisfaction in percentage points, and system-cost delta (**lower cost is better**). Alternative roads are ranked by their largest absolute utilization change, with each road listed once in the summary and all sampled horizons in expandable details. Projection labels show actual horizons and scenario-end truncation. Every preview assumes no further intervention; unfavorable effects remain visible and projected effects remain separate from observed tutorial outcomes.

Forecast and preview labels use actual elapsed projection time when a scenario ends before the requested horizon, and mark those samples as scenario end. Forecast and preview horizons must align to the 0.25-minute simulation tick.

The road hold control holds currently eligible waiting trips whose fastest route would traverse the selected road. It does not create a persistent future-demand control; future trips are unaffected unless they are already waiting when the action is applied.


## Results and validation

Results use the actual scenario name. Practice reports completion and observed metrics without a competitive rating or baseline improvement, and offers **Start Monday Morning** and **Practice Again**. Monday Morning shows final system cost and a compatible no-action baseline (same scenario, seed, and end time); higher improvement and lower system cost are better. Both screens display waiting and active unfinished trips alongside arrivals. Completed-travel statistics cover arrivals only. No best/worst decision commentary or optimality rating is inferred.

The regression suite includes UI clicks for explicit preview, review, Apply, Cancel, Retry, tutorial recovery, and results actions, alongside deterministic engine, worker protocol, and replay tests. JSDOM uses a simulated worker and does not render Canvas; those tests are not browser validation. See [implementation status](docs/IMPLEMENTATION_STATUS.md) for the actual browser checks and remaining limitations.
