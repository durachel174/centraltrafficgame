# Clearance investigation — engine 0.4.0 / Monday Morning 3

**Current follow-up:** engine 0.5.0 / Monday 4 now implements official player-visible post-demand evaluation. The causal investigation below is historical; its provisional fixed-window decision is superseded by the [current contract and measured validation](POST_DEMAND_EVALUATION.md).

Implementation milestone: `d270ee1`. Phase 12 remains **IN PROGRESS**. Road admission was missing, not passenger accounting. Enforcing existing road storage removes the measured near-gridlock on the audited Monday runs. This does not validate the density model against real traffic or establish scoring fairness.

## Reproduce

No AGENTS.md was present in this checkout or its parent directories. README, implementation status, traffic model, Phase 12 validation and existing policy/hold/endgame audits were reviewed before changing physics.

```bash
npm run audit:clearance -- --seeds=428193,428194,428195,428196,428197,428198,428199,428200,428201,428202 --policies=baseline,reactive,repeated-hold-25-5m,extended-hold-100-120m,repeated-reroute-25,repeated-reroute-100,late-reroute-25-at-90,late-reroute-100-at-90,late-reroute-25-at-105,late-reroute-100-at-105,late-reroute-25-at-115,late-reroute-100-at-115,combined-25-from-90,combined-100-extended-from-105 --limit=1440 --sample=15 --out=/private/tmp/clearance-after.json
node --import tsx scripts/probe-storage.ts --out=/private/tmp/storage-after.json
```

`--limit` is additional simulated minutes after 09:00, not a wall-clock timeout. `--sample` controls the time-series and vehicle trace resolution. Seeds, policies, positive tick-aligned limits, and output paths are explicit and validated. Default seeds/policies equal the command above. `node --import tsx scripts/audit-clearance.ts ...` is equivalent if the tsx CLI encounters an IPC restriction.

The independent diagnostic clones the completed state, extends only its stopping time, replaces future demand with zero, disables nested forecasts and terminal estimates, and steps NO_OP until all trips arrive or the safety limit. It preserves existing holds, active events, temporary reductions, RNG/demand carry, vehicles/routes, waiting trips and accumulated cost inputs. Final requested counts and action-log lengths must match the decision cutoff. The official source state is untouched. A cap is explicitly **censored**, with unresolved active/waiting counts, never lifetime cost.

Reports contain both cutoff and continued metrics/components, policy ranks within each seed, changes relative to paired baseline, departures/arrivals per interval, every directed road's occupancy/comfortable and maximum capacity/modifier/closure/utilization/travel-time multiplier, cumulative minutes above comfortable occupancy, origin-unreachable counts, exit queues, repeated-node routes and distance. Three vehicles with the highest frozen-current-speed remaining-time estimates at 09:00 retain their identity through the continuation. Their full route, sampled edge index/transitions, progress, elapsed travel, distance, instantaneous implied speed and measured interval speed are recorded. Remaining-time estimates explicitly freeze current conditions; they are not arrival promises. Sampling can skip intermediate edge transitions; lower `--sample` to 0.25 for tick-resolution traces. Bottleneck duration is accumulated time above utilization 1, not one uninterrupted episode. Non-finite utilization/travel estimates serialize as JSON null (unavailable/unbounded), with closures explicitly flagged. Travel-time samples use the last movement tick's times alongside end-tick occupancy, so small count differences are expected.

Evidence is checked in at [measurements/phase12-clearance-investigation.json](measurements/phase12-clearance-investigation.json); it retains all paired costs/counts and representative traces without checking in the 52 MB original telemetry report. Full local reports are reproducible. Historical engine 0.3.0 evidence is from commit `3ef9c75`, separately from corrected comparisons. To rerun with the new instrument on old physics, archive that commit into a temporary directory, link this checkout's node_modules there, copy `scripts/audit-clearance.ts`, `scripts/clearance-policies.ts`, `scripts/probe-storage.ts` and `src/simulation/diagnostics/Clearance.ts` into the matching locations, then execute from that directory. Use `--limit=240` for the historical censored audit; `--beta=2 --policies=baseline --limit=1440` reproduces the diagnostic-only exponent alternative. Its configuration identity differs from official settings.

## Cause and unit audit

Distances are kilometres, speed is km/h, free-flow time is `length / speed * 60` minutes, progress advances by `dt / currentTravelTime`, and arrival timestamps account for the fraction of a tick used on each edge. Controlled two-edge fixtures verify exact distance and .25-minute arrival. Recomputing travel time as occupancy changes is intentional; vehicles do not retain obsolete entry-time speeds.

`comfortableCapacity` has always been simultaneous occupancy in this implementation: `currentVehicleCount / (comfortableCapacity * modifier)`. It is not vehicles per hour. `maximumCapacity` was configured and copied but **never enforced**. Both origin dispatch and downstream entry were unlimited. Dispatch also routed an entire waiting batch without updating counts between departures.

The BPR-shaped expression is `T/T0 = 1 + .15 * (occupancy/C)^4`. FHWA's [description of conventional BPR](https://ops.fhwa.dot.gov/publications/fhwahop21014/chap4.htm) instead uses hourly flow relative to hourly capacity. Central Traffic uses its shape as a density slowdown, not a calibrated flow model. At very large occupancy, the resulting approximate outflow `n/T(n)` falls proportionally to `n^-3`. Unlimited entry can therefore increase occupancy while almost stopping all existing occupants. This is the measured feedback mechanism; it does not establish that BPR is generally invalid.

Measured examples:

- Seed 428193 baseline at 09:00: North Residential Arterial **885 occupants / comfortable 70 / maximum 120**, utilization **12.643**, travel multiplier **3,833.412×**. South Bridge Approach: 755 / 78 / 145, multiplier **1,303.845×**. The scheduled bridge capacity has already restored by then.
- `veh_4059` starts the continuation on the first edge of a valid nine-edge route at progress .000553. Four hours later it is still there at .023319. Distance rises from .001217 to .051303 km: about **50 metres in four hours**, **.01252 km/h**. Its frozen-condition remaining estimate starts at **10,574 minutes**. This is slow movement, not a lost arrival timestamp.
- Isolated one-kilometre, 60 km/h road, comfortable occupancy 10, maximum 20, burst 100: old engine admits all 100 and computes **1,501 minutes** per road traversal. No trip arrives within 360 minutes. Corrected engine admits 20 and retains 80 at origins; initial road time is **3.4 minutes**, unchanged formula. All 100 arrive by **17.5 minutes**. No demand calibration or penalty changes are involved.

Dijkstra returns finite simple routes when reachable; unavailable routes remain waiting. No baseline sampled route revisited a node, and no audited origin was unreachable. Reroutes can revisit a previously traversed prefix; repeated rerouting retains its real distance and dissatisfaction consequences. No route repair or loop suppression was introduced. Closed roads are excluded by routing; already committed vehicles stop on a closed current edge or at a closed downstream entrance and resume when reopened. Capacity events retain interval-start activation/restoration. Existing holds and scheduled restoration continue in diagnostics and in cloned projections. Overlapping debug and scheduled restrictions still have the existing last-write/restoration semantics; the official event configuration has no overlaps.

## Alternatives and selected correction

1. **Keep unlimited density admission, reduce exponent from 4 to 2.** On ten baseline seeds, all cleared in 21–36.25 additional minutes (mean 27.725). But this still admitted arbitrarily many occupants into physical road space, changed the response curve everywhere and left maximumCapacity unused. It is a diagnostic alternative, not an adopted calibration.
2. **Enforce existing maximum storage and retain the current density slowdown. Selected.** Origin trips wait for space. A downstream-blocked vehicle stays at progress 1 on its current road, retaining occupancy and active elapsed travel cost. Storage counts change immediately when a vehicle enters/leaves; existing occupants are never evicted. Scheduled incidents reduce comfortable capacity/speed, not physical storage. Closure forbids entry and movement. No travel-time clamp, teleport, passenger deletion or new score weight is added.
3. **Calibrate hourly flow and explicit point queues.** Physically different and potentially useful, but needs new flow capacities and queue representation rather than reinterpreting the current occupancy numbers as hourly throughput. Deferred pending calibration; lowering demand alone would conceal the demonstrated admission defect.

Stable vehicle order breaks same-tick admission ties deterministically. Movement times remain frozen per tick. A blocked exit can wait until the next tick for a slot freed later in that order: at most .25 minute discretization per such opportunity. Full storage cycles can deadlock even with individually reachable routes; a controlled three-road cycle regression retains all three passengers and reports unresolved queues at the safety cap. The audited Monday policies do not encounter this outcome. No claim of universal clearance follows.

An OD route cache exists only within dispatch, and is cleared on every successful admission. Blocked requests see identical state and can share work; successful admissions must recompute occupancy-dependent routes. Free-flow baseline routes share a separate per-tick cache. This avoids repeating the same Dijkstra search thousands of times under stress while preserving exact deterministic outcomes; a parallel-road test checks invalidation after each admission.

Origin waiting accrues departure delay once per waiting tick. Vehicles queued inside the network accrue active elapsed travel once and no extra origin charge. Their distance stops at the exit; it is not repeatedly added while blocked. Results show exit queues as a **subset** of active unfinished trips, separately from origin waiting.

## Paired policy results

Ten identical seeds, 428193–428202, 4,125 requested trips each. Comparisons in this table are **within corrected engine 0.4.0 / scenario 3**. Lower cost is better. Final cost excludes the cutoff terminal estimate and includes realized post-cutoff waiting/travel and all other normal cost components. Each row clears 10/10 runs, with **4,125 completed, zero active, zero waiting**. Horizon is +1,440 minutes maximum; actual stops are 43.25–170.25 minutes. Values are means, rounded; raw paired metrics, terminal/accrued breakdowns, satisfaction, congestion, excess distance and rankings are in the evidence file.

| Policy | 09:00 cost | Full-clearance accrued cost | Additional min | Travel passenger-min | Origin waiting passenger-min | Satisfaction % | Rank changes vs baseline |
|---|---:|---:|---:|---:|---:|---:|---:|
| baseline | 214,177.9 | 314,226.6 | 48.0 | 117,670.9 | 17,567.3 | 84.4 | 0 |
| reactive | 218,158.2 | 319,707.6 | 49.6 | 119,955.9 | 16,647.1 | 83.9 | 4 |
| repeated-hold-25-5m | 215,781.0 | 315,293.8 | 47.5 | 117,637.1 | 17,911.2 | 84.3 | 2 |
| extended-hold-100-120m | 371,223.9 | 511,542.9 | 161.2 | 110,911.6 | 90,867.2 | 77.3 | 0 |
| repeated-reroute-25 | 272,538.6 | 483,218.4 | 68.5 | 145,912.2 | 34,435.7 | 72.8 | 0 |
| repeated-reroute-100 | 440,946.2 | 890,769.1 | 97.6 | 188,089.6 | 104,116.0 | 48.2 | 0 |
| late-reroute-25-at-90 | 216,222.6 | 331,095.0 | 50.3 | 122,499.2 | 16,845.9 | 83.1 | 1 |
| late-reroute-100-at-90 | 231,688.2 | 388,267.3 | 59.9 | 129,466.2 | 24,699.8 | 79.5 | 0 |
| late-reroute-25-at-105 | 218,132.6 | 331,403.4 | 50.9 | 120,063.8 | 19,570.6 | 83.3 | 0 |
| late-reroute-100-at-105 | 222,209.1 | 399,599.1 | 66.3 | 130,188.9 | 27,061.2 | 78.8 | 0 |
| late-reroute-25-at-115 | 215,782.7 | 330,473.3 | 49.8 | 121,020.4 | 18,205.0 | 83.2 | 0 |
| late-reroute-100-at-115 | 218,557.4 | 372,640.2 | 68.6 | 127,223.6 | 22,824.6 | 80.4 | 0 |
| combined-25-from-90 | 235,429.2 | 479,028.1 | 82.5 | 141,677.9 | 36,521.3 | 73.5 | 0 |
| combined-100-extended-from-105 | 363,294.4 | 569,052.5 | 162.8 | 127,563.9 | 83,683.9 | 71.5 | 0 |

At the corrected cutoff baseline averages 2,658.4 completed, 1,162.1 active and 304.5 origin-waiting trips. It is still far from full clearance at 09:00. Reactive is worse on mean cutoff **and** mean full-clearance cost. Repeated 100% rerouting is markedly unfavorable (890,769 final cost vs baseline 314,227); holds reduce congestion in some cases but can impose much more rider waiting. These outcomes are retained.

Four reactive pairs are worse than baseline at cutoff but better after full clearance: seed 428194 **+962 → −5,208** cost units; 428195 **+1,752 → −4,595**; 428196 **+627 → −4,689**; 428199 **+803 → −13,723**. Two short-hold pairs and one late-25%-at-90 pair also change sign. “Rank changes” counts both directions relative to the same-seed baseline, not a fairness failure count. Complete per-policy orderings can be reproduced by the command's `rankings` output.

The historical 0.3.0 experiment censored **all 140 runs** at +240 minutes. Baseline averaged 1,949.4 completed at cutoff and only 2,149.4 completed at the cap, with 1,975.6 still active. Historical capped accrued baseline cost was 7,261,710; this is **not lifetime cost**. The correction's lower numerical costs cannot be described as player improvement against the old baseline: movement semantics and configuration identity changed. The older audit's capped ranking reversals are evidence of horizon sensitivity, not full-clearance rankings.

## Evaluation decision

**Retain official fixed-window scoring for this milestone; use full-clearance accrued cost for the new comparative diagnostic wherever it actually clears.** Full clearance is now computationally and physically feasible for the tested Monday policies. That removes the original barrier to a future full-journey evaluator, but does not establish a safe universal ending rule for arbitrary repeated actions, storage cycles or unreachable configurations. The new cycle counterexample is unresolved, and storage/density calibration lacks empirical validation. Do not silently replace saved scores or claim fairness from this policy sample.

The next scoring experiment must test adversarial reroute cycles and unreachable/closure cases across a broader seed/policy set, specify a player-visible clearance phase and censored-results contract, and compare candidate evaluation windows before changing official scoring. No residual-cost approximation is justified here: full clearance is available for the measured cases; guessing additional cost for pathological cases would conceal them.

| Contract | Current official game | Independent diagnostic |
|---|---|---|
| Player action window | 07:00 ≤ interval start < 09:00 | No actions after the source's 09:00 cutoff |
| Demand window | Generated through final 09:00 tick; arrivals at the interval end wait until a later dispatch | No new requests after cutoff, including the final generated cohort retained from the source |
| Evaluation end | Exactly 09:00; further steps are no-ops | First tick with no active/waiting trips, otherwise explicit safety limit; arrivals have within-tick timestamps |
| Held/origin waiting/unreachable | Accrued departure delay and dissatisfaction; remaining imposed hold separately at cutoff | Actual waiting continues once, including holds and unreachable trips; no terminal estimate added |
| Traveling/exit queues | Elapsed travel and dissatisfaction, congestion and planned excess km | Full elapsed/realized travel, waiting, final satisfaction, congestion and actual excess km on completed runs |
| Safety cap | No continuation is installed in official state | Label censored; show unresolved counts and accrued cost only; never substitute it for completed-trip lifetime cost |
| Previews | Same corrected engine; horizon limited by 09:00, same terminal hold liability if reached | Not a prediction of complete clearance; diagnostic costs are not preview deltas |

The cutoff has a six-component cost: five accrued components plus a separately reported known terminal hold obligation. Continued realized cost starts from stored accumulated inputs, disables that estimate, and charges actual subsequent waiting once. Never add the cutoff estimate to the final accrued result. Satisfaction cost reflects the final scored deficits rather than summing every intermediate dissatisfaction estimate. Unreachable trips continue accumulating waiting until the cap; no passenger is removed. Terminal liability does not estimate future network congestion or complete remaining journeys. Results now explicitly say “fixed-window comparison” and expose origin waiting vs active exit queues.

## Compatibility

Engine **0.4.0**, Monday Morning **3** (practice inherits the configuration version), internal snapshot **2** with explicit engine identity. Run JSON schema stays **1** because its structure remains extensible, but exact engine/scenario/configuration identities change. Old 0.3.0 exports and snapshot-1 objects are rejected clearly; no conversion or rescore. Exit-queue metrics must be integer counts no larger than active trips. Baseline cache keys, worker snapshots, preview clones, configuration digests, completed-run checksums, replay and CLI all use the new identity. Forecast caches remain derived and excluded from authoritative checksums. Playback grouping and worker completion timing do not alter the traffic state.

The cache optimization was checked against the uncached corrected audit: all 140 cutoff costs, final accrued costs and clearance times match exactly. Engine 0.4.0 policy comparisons therefore remain valid after that optimization.

## Validation and limitations

See the current section of [Phase 12 validation](PHASE12_VALIDATION.md) for commands, final test/build outcomes, benchmark and actual browser checks. Existing tests are retained. New tests cover exact units/multiple-edge movement, finite overload and admission, conservation/unique IDs/counts/distance, origin vs exit queues, closed roads/reopening, unreachable trips, a full storage cycle, holds/restoration during continuation, source immutability/no new demand or logged interventions, terminal estimates vs realized waiting, preview/forecast parity, route-cache invalidation and new-version export/replay/old-version rejection. Existing determinism, playback grouping, UI/tutorial and delayed-worker tests run unchanged.

Remaining limitations: density slowdown and storage sizes are game parameters, not calibrated engineering flow capacities; deterministic admission order is not a lane model; closed roads stop existing occupants; full cycles can deadlock; origin-equals-destination requests have no empty-route completion rule (official demand has none); overlapping debug restrictions retain old restoration semantics; the controller does not anticipate spillback; fixed-window rankings differ from lifetime rankings; wider policy/seed and independent human accessibility/performance validation are still needed. Phase 12 stays **IN PROGRESS**.

## Official clearance follow-up (2026-10-20)

The investigation's finite-storage correction and movement rules are preserved. Monday now closes decisions/demand at 09:00, retains that final cohort and continues the authoritative run until all trips arrive or a configured +240-minute limit. This limit exceeds all 140 previously measured complete continuations (maximum +170.25), but does not promise universal clearance. Capped cases are labeled incomplete, with accrued costs/unresolved passengers and no final ranking or improvement percentage against a completed baseline.

Watch and bounded/cancellable fast-forward run identical live ticks; neither uses the old reconfigured diagnostic continuation. Cutoff metrics (including a historical hold estimate) are stored separately from actual subsequent waiting. Official realized distance also excludes untravelled planned kilometres. Final cost is comparable only when both evaluations finish all-arrived under matching identities/settings. The former diagnostic is retained solely for legacy fixed-window fixtures and rejects substitution for an official evaluated run. See [full contract, 150 paired outcomes, replay compatibility and actual browser evidence](POST_DEMAND_EVALUATION.md).
