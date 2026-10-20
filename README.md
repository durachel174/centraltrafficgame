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

Results use the actual scenario name. Practice reports completion and observed metrics without a competitive rating or baseline improvement, and offers **Start Monday Morning** and **Practice Again**. Monday Morning shows final system cost, weighted objective components, and a compatible no-action baseline computed in a dedicated worker; higher improvement and lower system cost are better. Compatibility includes engine/scenario versions, all scenario configuration and objective weights, seed, and start/end time. Both screens display waiting and active unfinished trips alongside arrivals. Completed-travel statistics cover arrivals only. No best/worst decision commentary or optimality rating is inferred.

The regression suite includes UI clicks for explicit preview, review, Apply, Cancel, Retry, tutorial recovery, and results actions, alongside deterministic engine, worker protocol, and replay tests. JSDOM uses a simulated worker and does not render Canvas; those tests are not browser validation. See [implementation status](docs/IMPLEMENTATION_STATUS.md) for the actual browser checks and remaining limitations.


## Monday Morning challenge

Start Monday Morning at 07:00, anticipate the configured rush-hour pressure, handle the scheduled **08:12 North Bridge incident** (40% capacity reduction for 15 minutes), observe the **08:27 capacity restoration**, and finish at 09:00. A compact stage/status strip shows commute building, rush hour, incident, recovery, and completion. Restoration means capacity is available again; it does not claim the traffic has cleared. Incident facts and remaining scheduled duration come from configuration and actual event state, under any playback speed.

**Decision history** records actual applied interventions once, with simulation time, target, parameters, affected count, and immediate tick system-cost change. That change includes traffic evolution during the interval; it is not a long-term causal rating. Canceled previews are excluded. The explicit Preview → Review → Apply/Cancel controls remain available during live play.

At results, inspect the objective components and baseline conditions. **Try This Seed Again** creates a clean identical challenge; **New Seed** uses a new nonzero 32-bit seed consistently for demand, baseline, logging, export, and replay. The current seed is available in the header and results.

**Watch Replay** starts a paused replay from the original 07:00 state. Resume with 1x/2x/4x; pause whenever needed. Live interventions are disabled. **Restart Replay** restarts the recorded stream. At 09:00 the app verifies every final metric and a checksum of all deterministic simulation state, displaying success or a specific failure.

**Export Completed Run JSON** downloads a local versioned file. Import through **Run files** during free play or the results screen. Invalid/unsupported/incompatible files report an error without replacing the session. A valid import shows its seed/decision count and requires **Start Imported Replay** before replacing the active run. No file is uploaded. The importer supports this version of Monday Morning, not older internal run formats or practice exports. Files may contain at most one intervention per tick; duplicate same-tick entries are rejected explicitly rather than discarded.

See [replay format and compatibility](docs/replay.md) for validation rules, deterministic representation, and versioning. Baseline worker failures show an unavailable comparison and Retry; there is no blocking fallback. The checksum detects consistency problems and is not a tamper-proof signature.
