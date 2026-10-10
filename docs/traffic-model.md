# Traffic Model

The city is a directed graph `G=(V,E)`. Edge travel time uses the configurable Bureau of Public Roads style function:

```text
T = T0 * (1 + alpha * (x / C)^beta)
```

Capacity modifiers allow incidents and future adversarial disruption. Demand is generated from a time curve and weighted origin/destination probabilities, so congestion emerges from demand rather than scripted jams.

## Tick Convention

The engine uses a fixed 0.25-minute interval. A call to `step(action)` simulates `[t, t + dt]`.

1. Actions and scenario capacity state are applied at `t`.
2. Eligible waiting trips dispatch at `t`; their `actualDepartureTime` is `t`.
3. Trips still waiting after dispatch accrue exactly `dt` passenger-minutes of departure delay.
4. Traveling vehicles move during `[t, t + dt]` and may cross multiple edges.
5. Arrivals are timestamped at `t + elapsedWithinTick`, never later than `t + dt`.
6. Demand generated for the interval is appended at `t + dt` and can dispatch on a later step.

This convention prevents newly generated trips from moving before departure and preserves `requestedDepartureTime <= actualDepartureTime <= actualArrivalTime`.

## Objective Units

Travel-time cost is measured in passenger-minutes. Completed vehicles contribute full trip duration, and active vehicles contribute elapsed travel time so leaving trips unfinished cannot improve the objective.

Departure delay is passenger-minutes spent waiting before dispatch. The engine adds this once per fixed tick for every trip already waiting at the start of that tick, including held trips and trips whose route is unavailable.

Dissatisfaction is scored for completed, active, and waiting passengers. Waiting passengers lose satisfaction from departure delay. Active passengers keep their current satisfaction and receive an estimated late-delay penalty once elapsed travel time exceeds their tolerance. Empty networks report average satisfaction as 100.

Excess distance is kilometers, not minutes. Each vehicle records a baseline distance in kilometers from the free-flow fastest route, where edge weight is base travel time. The metric compares completed distance, or active distance plus remaining planned route distance, against that baseline.

## Forecasts And Previews

Forecasts are deterministic no-further-intervention projections at +5, +10, and +15 simulated minutes. They run one cloned forward rollout and account for current vehicles, waiting and held trips, future demand, scheduled capacity events/restorations, congestion-dependent movement, and routing. Forecasts are refreshed at a configurable interval; Monday Morning uses 5 simulated minutes.

Action previews compare two cloned rollouts from identical state and identical future randomness: no intervention versus the proposed action. Deltas use `action branch - no-action branch`, so positive network cost and delay deltas are worse, while positive satisfaction delta is better. The MVP preview horizon is configurable and is 15 minutes for Monday Morning.

Preview utilization changes are sampled at explicit horizons measured from the current live state. Passenger delay is reported as both total passenger-minutes and minutes per passenger over the same action/no-action cohort; it combines departure delay plus travel delay beyond free-flow baseline travel time, including unfinished trips at the preview horizon.
