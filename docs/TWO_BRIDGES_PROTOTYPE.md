# Two Bridges, One Rush — experimental prototype

Implementation milestone: `3dd167b`.

## Current goal and interaction (scenario 2)

Get **280 of 300 commuters to Bay Works by 10:15**. Decisions end at **10:00**, followed by the existing clearance phase. Introduction, HUD, Help and results use the same configuration-derived goal. The HUD counts actual arrivals timestamped on or before the target, separately from eventual arrivals. Results say target met/missed independently of whether evaluation fully cleared. All trips and unfinished passengers still count; no grades or optimality claims are added.

Six groups of 50 appear at relative minutes 0, 32, 64, 96, 128 and 160, one quarter-minute after the scheduled boundary. Select a real pending group at its map hub or in the departure tray. Each tray item shows actual undecided waiting count, origin/destination and **automatic eligibility in simulated minutes**, calculated from authoritative request timestamps. The countdown stops with simulation pause and is not a per-tick live announcement. At expiry, remaining requests say eligible/queued; full roads can still block entry. Eligibility is not a departure guarantee. The first actual group pauses to introduce the choice; subsequent Preview buttons deliberately pause for reading.

Explicit **Preview → Review → Apply/Cancel** remains the only action flow. Hover/focus does not calculate. The experimental review leads with affected commuters, average passenger-delay change in **minutes per rider**, selected bridge pressure, strongest alternative-road effect and actual projection horizon. Negative delay is better. Average projected delay covers the projected passenger population, not just the selected group. System cost (lower is better), satisfaction, total passenger-minutes and all road horizons remain in expandable details. These short forecasts assume no further intervention and promise neither final journey savings nor arrival times. Unfavorable previews remain visible. Monday's detailed review is unchanged. Loading, errors, Retry, stale/session guards and worker cleanup remain shared. Escape/Cancel returns keyboard focus to the originating Preview control; Apply falls back to Resume when the group controls disappear.

A route choice applies once to currently undecided waiting members; already traveling, future and unrelated requests are unaffected. A six-minute Hold releases to ordinary automatic routing afterward. It can release earlier than the unchosen twelve-minute window, so a Hold's projected delta can be favorable relative to no action; it still incurs actual origin waiting. Invalid group/path/hold actions reject atomically. Storage, routing, passenger accounting, deterministic ticks and scoring weights are unchanged.

## Warm map and observed feedback

SVG/CSS geography, warm paper/land/water, readable district/bridge labels and Canvas markers remain. Each marker corresponds to an actual traveling trip; small glyph offsets separate overlapping cohorts and do not change physics. Static counts and dotted road patterns complement color. Reduced motion hides moving glyphs while retaining stopped queues, counts and text.

Presentation-only snapshots detect actual arrival increments, the first observed corridor entry of each group/corridor, and changes in actual road-exit queue counts. A restrained map label aggregates arrivals, shows up to two corridor entries and the latest queue change in a bounded four-second window. Bay Works receives a static brief outline, without flashing or motion. Current arrived/queued totals remain visible afterward. Applied route emphasis lasts five seconds after playback resumes and remains readable while paused. Rerenders do not replay old transitions; reset/same-traffic retry clears presentation feedback. These observations never enter engine state or replay files and are distinct from preview projections. Moving counts are not live screen-reader announcements; action/review/phase status remains available.

## Matched target audit

Reproduce with:

```sh
node --import tsx scripts/audit-two-bridges.ts --out=/private/tmp/two-bridges-targets.json
```

[Raw scenario-2 audit](measurements/two-bridges/target-strategies-v2.json): **nine policies × five matched seeds (428193–428197), 45 full-clearance runs**. Records include actual arrival timestamp distributions, candidate deadline counts, completed delay, objective, unresolved counts, clearance duration, bottleneck pressure and observed decision opportunities. Seeds vary passenger tolerance, not the fixed group counts/timing; their movement distributions are identical. This is limited traffic diversity, not five independent demand patterns. Objective weights were not tuned.

| Policy | By 10:10 | By 10:15 | By 10:20 | Mean completed delay (min/rider) | Clearance (simulated min) |
| --- | ---: | ---: | ---: | ---: | ---: |
| No intervention | 268 | 268 | 286 | 34.07 | 22.25 |
| Every group North | 230 | 244 | 248 | 39.78 | 45.50 |
| Every group South | 276 | 284 | 292 | 26.40 | 22.00 |
| Alternate North/South | 292 | 292 | 292 | 26.16 | 21.75 |
| Middle three South, others North | 286 | 300 | 300 | 20.26 | 10.25 |
| Same selective plan, each choice six minutes later | 286 | 286 | 300 | 26.26 | 16.25 |
| Hold every group six minutes | 276 | 276 | 294 | 28.70 | 23.00 |
| Hold every group twelve minutes | 268 | 268 | 286 | 34.07 | 22.25 |
| Hold every group ninety minutes | 126 | 126 | 144 | 117.24 | 102.75 |

Every audited run eventually completed 300 with zero unfinished. The chosen **280 by 10:15** misses under no intervention but is achievable by several different crossing plans, including delayed selective choices. All-South's four-person margin is narrower than the selective policies; no claim of robustness to untested demand or arbitrary late decisions is made. Earlier deadlines were less forgiving; the former 10:40 target admitted all 300 without intervention. The target is an understandable service count, separate from weighted objective cost, rather than an engineered policy ranking. Short holds do not automatically win; excessive holds substantially harm arrival and delay outcomes. No tested policy is declared globally optimal.

North's announced restriction remains **07:55–09:00, 35% less comfortable capacity**, without changing physical storage (18 North, 42 South). Free-flow complete routes remain seven versus fifteen minutes. Six scheduled decision opportunities each have a twelve-simulated-minute window, about twelve seconds at default 1x; Preview provides unlimited paused reading time. Nominal active playback across audited policies is **190.25–282.75 seconds**, excluding all pauses; six-minute holds take 203 seconds and no intervention 202.25 seconds. Actual desktop timing is recorded below separately.

## Compatibility and validation

Experimental scenario **2**, engine profile **0.5.0+groups.1**, run schema 2, snapshot 3. The changed target/configuration identity explicitly rejects scenario-1 experimental files. The [older example export](measurements/two-bridges/example-run.json), screenshots and [original strategy data](measurements/two-bridges/strategies.json) remain historical scenario-1 evidence, not current compatible replay fixtures. Monday Morning remains scenario 4 / engine 0.5.0; its scoring, simulation and compatible files are unchanged. The optional target is presentation configuration, not a new simulation rule.

Validation results and browser checks for this milestone are recorded below. Automated UI tests use controlled workers and Canvas-free JSDOM; they are not browser validation. Human playtesting has not occurred. Phase 12 remains **IN PROGRESS**.

### Final automated validation

- `npm test`: **176/176 passed**, ten files, **3.93 s and 4.00 s** on two consecutive final runs with normal concurrency. All prior 168 tests remain; eight new regressions cover current goal/version rejection, request-timestamp counts and consistency, the actual App interval's pause behavior, expired blocked requests, summary/details/Retry/stale Cancel, real transition deduplication/purity, bounded reduced-motion feedback/reset/retry, and unchanged selected-bridge samples. Feedback transition checks use a controlled storage fixture; full experimental and Monday replay integrations remain. Existing environment warnings about Node localStorage/Canvas are not test failures and are not browser evidence.
- `npm run build`: TypeScript and production build passed; Vite bundling **1.35 s**. Final main asset `index-CJT4F7YA.js`.
- Updated strategy audit: **45 runs**, all fully cleared, raw results above. Configuration identity `0.5.0+groups.1:two_bridges_one_rush:2:98a7e5cd2743c886`.

### Actual browser checks

Real local development (5182) and production (4182) browsers rendered Canvas and loaded real module workers. Both final builds were played from introduction through completed results, with actual group action, observed traffic and the exact 10:00 pause/locked interventions. Development used first-group North, 4x and clearance fast-forward: 268 by target, all 300 eventually completed, 32.1 min mean completed delay, active playback **0:47** (accelerated playback/fast-forward, not a default-speed duration). Final production used first-group South then automatic choices, 4x and watched clearance: 268 by target, all 300 completed, 33.7 min mean delay, active playback **0:52**. Both correctly said **Target missed** despite full clearance.

A separate measured production run at default 1x sent the first two groups South (the second near eligibility), then left later groups automatic. It measured **3:25 active playback, pauses excluded**, finished all 300, but only 268 by 10:15; mean completed delay 35.0 min and cost 29,424.3 versus the 28,774.6 no-action reference. It was worse, and results did not hide that. Its actual Watch Replay verified actions, cutoff/final metrics, finish time and state after 4x plus clearance fast-forward. This measurement/replay preceded the final unchanged-selected-pressure and bounded-feedback reporting fixes; a subsequent full final-asset production round is reported separately above. No authoritative traffic, weights or goal changed between them.

Completed checks include request-based countdown progression and pause, automatic eligibility/departure, real North/South/Hold worker reviews, separate Apply/Cancel, Escape with focus return, Tab between Preview choices, Enter activation, supporting details, real stale-result Retry, Help/return, reset, genuine arrival/queue/corridor counts, same-seed retry clearing presentation and returning to the intro. Initial browser inspection exposed Cancel focus loss and missing unchanged North pressure; both were corrected, covered by tests and rechecked in final browsers. Layouts/screenshots were inspected at **1280×720 and 1440×900**; temporary viewport override restored. Captured development and production console warning/error lists were empty. No native reduced-motion or performance certification claim is made.

Screenshots: [selected group/countdown](measurements/two-bridges/v2-selected-group.png), [simplified South review](measurements/two-bridges/v2-review.png), [unchanged North pressure at 1440×900](measurements/two-bridges/v2-north-review-1440.png), [final observed traffic consequences](measurements/two-bridges/v2-final-consequences.png), [final production results](measurements/two-bridges/v2-final-production-results.png), [measured 1x results](measurements/two-bridges/v2-results-1x.png), [verified replay](measurements/two-bridges/v2-replay-verified.png), [final development results](measurements/two-bridges/v2-development-results.png).

### Remaining limitations

Native reduced-motion preference switching, pointer hover, forced worker-error Retry, completed local-file export/import, safety-limit results and a target-met finish were **not revalidated in this milestone's live browser**. Reduced motion, no-work hover/focus, error recovery and incomplete results have automated coverage; target-met policies have actual headless matched simulations. Those are not substitutes for the missing browser checks. Fast-forward cancellation remains covered by existing batch tests, not a newly completed experimental browser check. No screen-reader, cross-browser, mobile, repeated-device frame-time or human usability claim is made.

Human playtesting remains pending: whether 280/300 by 10:15 is understandable, forgiving enough and motivating requires real participants. Fixed cohorts offer only limited seed diversity. The twelve-second unpaused decision window can be missed; Preview pauses allow reading, and eligible blocked requests remain selectable. Long holds, unreachable routes or storage cycles can still hit the 13:00 safety limit; incomplete results retain unfinished counts and accrued costs. No new scenarios, gameplay subsystems, telemetry, ML or claim of optimality were added.
