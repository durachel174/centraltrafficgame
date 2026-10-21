# Traffic Model

The city is a directed graph `G=(V,E)`. Edge travel time uses the configurable Bureau of Public Roads style function:

```text
T = T0 * (1 + alpha * (x / C)^beta)
```

In engine 0.4.0, `x` and `C` are simultaneous vehicle occupancy, not hourly flow. `maximumCapacity` is physical edge storage. Origin dispatch and downstream entry require a free slot, counts update immediately on each admission/exit, and existing vehicles are never evicted. Incidents reduce comfortable occupancy and speed; physical storage does not shrink. A blocked vehicle stays at progress 1 on the current edge and accrues elapsed travel cost; origin waiting accrues departure delay. Results count exit queues within active trips, not as additional waiting passengers. Stable vehicle order and quarter-minute ticks make admissions reproducible. Full storage cycles can remain blocked; no forced passage is added.

This is a game density slowdown shaped like BPR, not a calibrated hourly flow model. See [clearance investigation](CLEARANCE_INVESTIGATION.md) for the causal trace, alternatives, before/after paired results and controlled counterexamples.

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

Travel-time cost is measured in passenger-minutes. Completed vehicles contribute full trip duration, and active vehicles contribute elapsed travel time so elapsed costs do not disappear when a trip is unfinished. Monday Morning now continues through full post-demand clearance where feasible. An incomplete safety-limit run reports elapsed costs only and is not full-journey cost. Practice remains a fixed-window lesson.

Departure delay is passenger-minutes spent waiting before dispatch. The engine adds this once per fixed tick for every trip already waiting at the start of that tick, including held trips and trips whose route is unavailable.

Dissatisfaction is scored for completed, active, and waiting passengers. Waiting passengers lose satisfaction from departure delay. Active passengers keep their current satisfaction and receive an estimated late-delay penalty once elapsed travel time exceeds their tolerance. Empty networks report average satisfaction as 100.

Excess distance is kilometers, not minutes. Each vehicle records a baseline distance in kilometers from the free-flow fastest route, where edge weight is base travel time. With official clearance enabled, the metric compares distance actually travelled against the baseline; untravelled planned detours are not accrued costs. Complete trips have the same distance cost as before. Legacy fixed-window fixtures retain their historical planned-route convention.

## Forecasts And Previews

Forecasts are deterministic no-further-intervention projections at +5, +10, and +15 simulated minutes. They run one cloned forward rollout and account for current vehicles, waiting and held trips, future demand, scheduled capacity events/restorations, congestion-dependent movement, and routing. Forecasts are refreshed at a configurable interval; Monday Morning uses 5 simulated minutes.

Action previews compare two cloned rollouts from identical state and identical future randomness: no intervention versus the proposed action. Deltas use `action branch - no-action branch`, so positive network cost and delay deltas are worse, while positive satisfaction delta is better. The preview horizon is configurable and is 15 minutes for Monday Morning.

Forecast and preview samples record both requested horizon and actual elapsed horizon. Preview utilization changes are sampled at the sorted union of forecast horizons and the configured preview horizon in one rollout per branch. Objective, passenger-delay, and satisfaction deltas are computed at the actual preview horizon, not whichever forecast horizon happens to be last. If the scenario ends before a requested horizon, the sample reports the elapsed horizon, marks the result truncated, and duplicate end-state road samples are collapsed instead of shown as separate future predictions. The review UI matches the selected road by actual elapsed horizon, so a collapsed end-state road sample can still be shown for the preview's scoring horizon.

Configured forecast and preview horizons must align to the fixed 0.25-minute simulation tick. Non-aligned horizons are rejected with a configuration error rather than rounded silently.

Passenger delay is reported as both total passenger-minutes and minutes per passenger over the same action/no-action cohort; it combines departure delay plus travel delay beyond free-flow baseline travel time, including unfinished trips at the preview horizon; a projection can cross the decision cutoff into clearance without generating new demand. The selected road is included in preview utilization results even if it is not marked as a major road.

The road hold action is serializable as `DELAY_DEPARTURES` with an optional `targetEdge`. When `targetEdge` is present, the engine selects currently waiting trips whose current fastest route would traverse that road, then applies the configured percentage and duration to that eligible set. Origin and destination filters still narrow the eligible set when supplied. The action does not affect future demand; adding a persistent future hold would require an explicit expiring control.


## Objective breakdown and final comparisons

`objectiveBreakdown` exposes weighted travel time, congestion, departure delay, dissatisfaction, excess-distance cost, and terminal imposed-hold delay. The unrounded six components sum to `objective`. Raw travel and waiting inputs are passenger-minutes; congestion input is integrated squared excess utilization; dissatisfaction input sums satisfaction-point deficits; excess distance is km. Results label all weighted outputs as cost units rather than mixing them with raw minutes. Display rounding may make the displayed rows differ slightly from the displayed total.

Completed travel statistics measure dispatch-to-arrival travel and exclude pre-dispatch waiting. Completed trips contribute full travel; active trips contribute elapsed travel and remaining planned excess distance at the scenario end. Waiting trips contribute accumulated waiting delay and dissatisfaction. Satisfaction averages include completed, active, and waiting riders. Results explicitly show requested, completed, active unfinished, and waiting unfinished counts.

The no-intervention comparison uses identical engine/scenario versions, complete configuration, weights, seed, and full scenario end. Percentage improvement is `(baseline - player) / baseline * 100`: positive means lower player cost; negative means higher player cost. The baseline executes in a worker and cannot install an obsolete or mismatched response.


## Historical terminal imposed-hold accounting (Monday Morning version 2)

The decision and evaluation window remains 07:00–09:00. At the final tick only, sum `max(heldUntil - currentTime, 0)` for still-waiting trips. This is `remainingHoldPassengerMinutes`. Add a separate `terminalHoldDelay = departureDelayWeight * remainingHoldPassengerMinutes` (Monday weight 2.2). It charges the known minimum waiting obligation imposed by an applied hold beyond the cutoff. It does not guess post-09:00 travel, congestion, dissatisfaction or complete clearance. Accrued pre-cutoff departure delay remains separate and is not counted again. Expired/unheld trips incur zero terminal hold liability, and stepping a finished engine is a no-op.

Preview branches reaching scenario end include the same liability in system-cost delta and expose its passenger-minute delta separately. The ordinary passenger-delay delta remains observed delay to the actual projection horizon. Results distinguish remaining imposed hold from observed elapsed waiting and weighted cost units. Short horizons that do not reach scenario end do not invent terminal charges. Practice disables this scored terminal policy.

Ten paired seeds demonstrated equal old costs for 5-minute and 1440-minute holds with identical through-cutoff dispatch but 83,230 additional committed passenger-minutes per seed. The correction prices that exact difference, rather than tuning penalties to make a controller win. It is intentionally a lower bound: unfinished active-trip downstream congestion and full clearance remain outside this evaluation. See [audit evidence](PHASE12_VALIDATION.md).

Browser projections have source-labelled presentation age and rebased remaining horizons; synchronous headless projections retain their source-relative samples. Refresh intervals and projection physics are unchanged.


## Desktop beta follow-up audit

Fourteen deterministic policies over seeds 428193–428202 were compared at the official 09:00 cutoff and in an independent capped continuation with no new demand or interventions. Diagnostics disable the terminal hold component and accrue actual continued waiting once, avoiding double-counting the official known obligation. Some short-hold/reactive improvements reverse at the four-hour cap, but none of the 140 runs fully clear. Those censored results show horizon sensitivity without establishing complete-journey rankings or a justified additional residual cost. Scoring/weights remain unchanged at engine 0.3.0 / Monday 2; no general fairness claim follows. Reproduce with `npm run audit:endgame -- --runs=10 --clearance-minutes=240`; see [validation](PHASE12_VALIDATION.md) for assumptions, trip counts and accrued/terminal components.

## Historical clearance/evaluation contract (engine 0.4.0 / Monday 3)

The historical four-hour non-clearance above applies to engine 0.3.0. With maximum storage enforced, all 140 corrected paired diagnostics clear, but some rankings change between the cutoff and full clearance. Official actions, demand, projections and evaluation still stop at 09:00; results explicitly label the fixed window and show unfinished origin/active/exit-queue counts. No weights, residual penalties or terminal hold formula changed. The separate diagnostic continues existing holds/events/costs with zero new demand/actions and disables terminal estimates while accruing actual waiting once. Capped cases remain censored, including genuinely unreachable/full-cycle fixtures. Full-journey evaluation and queue calibration remain a Phase 12 follow-up; see [investigation](CLEARANCE_INVESTIGATION.md).

## Current official evaluation (engine 0.5.0 / Monday 4)

The fixed-window and diagnostic-only decisions in the historical sections above are superseded. Decisions and demand end at 09:00; the final demand cohort is appended at that boundary. Existing trips/holds/events/queues continue with NO_OP evaluation until all arrive or the configured 240-minute clearance limit (13:00). `isDone()` is evaluation completion. Non-NO_OP clearance calls return a reason without advancing time or altering state/logs. This is configuration-driven; practice omits clearance.

Final cost realizes actual waiting, active/completed travel, dissatisfaction, integrated congestion and travelled excess kilometres, with unchanged weights. Waiting at origins is charged once; exit queues count as active travel. No terminal remaining-hold estimate is added during clearance or at its limit. At the decision boundary a separate immutable checkpoint can retain the old minimum-hold estimate, labeled historical and excluded from final cost. A capped run retains all unfinished passengers and reports accrued cost, not full-journey cost or proven deadlock. Complete player/baseline comparisons require matching evaluation settings and both all-arrived statuses.

Decision previews use the same engine/phase boundaries. They label actual sampled horizons and whether clearance is included, and distinguish earlier branch completion if horizons differ. A finished branch remains at its final state for comparison with the later branch; no additional travel/waiting accrues after all arrivals. Short previews are not general final-cost predictions. During clearance action previews lock, but source-labeled forecasts remain available while watching. Bounded fast-forward clears/suspends forecast presentation until watching resumes.

The 240-minute maximum covers the investigation's 140 complete runs (+43.25–170.25 minutes) with margin, without promising clearance for arbitrary policies. A 1,440-minute late hold reaches the limit incomplete; storage cycles and unreachable trips remain genuine unresolved cases. See [contract, paired results and browser validation](POST_DEMAND_EVALUATION.md).
