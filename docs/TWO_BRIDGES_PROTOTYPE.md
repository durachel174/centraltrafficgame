# Two Bridges, One Rush — experimental prototype

Implementation milestone: `551fa8c`. Evidence collected during the October 2026 prototype work; final test/build results and incomplete browser checks are recorded below.

A separate, explicitly experimental challenge, available through **Two Bridges · Experimental** in the existing scenario switch. Monday Morning, its 0.5.0 rules and compatible files remain intact. This is a playable hypothesis about interaction and visual direction, **not evidence that human players find it fun**. Phase 12 remains IN PROGRESS.

## Goal, controls and visual direction

Get 300 scheduled commuters from Cedar Hill and Linden Park to Bay Works by **10:40**. Decisions end at **10:00**; arrivals continue afterward. The introduction is one short card: “Get commuters across the bay. The fast bridge won’t stay clear for long.” The first actual group pauses automatically and reveals controls. Select a pending group at its map hub or in the single departure tray, then explicitly Preview North, Preview South or Preview Hold. Hover/focus does not calculate or pause. The shared worker review has separate Apply/Cancel, affected requests, utilization and other-road effects, passenger-minutes/minutes per rider, satisfaction, cost and actual horizon. Enter and Escape work through the same controls as the mouse. An applied route is highlighted briefly; feedback reports the actual affected count.

The city uses warm paper, muted green land and blue-green water, simple houses/workplaces, bold bridge casings, readable district names and selected origin/destination rings. SVG/CSS draws geography and buildings; Canvas draws actual traveling vehicles. Marker spacing separates overlapping cohort glyphs for legibility and does not alter simulated progress or create trips. Dotted road patterns and explicit counts accompany color changes. Reduced motion suppresses moving vehicle markers while keeping stopped queues, traffic state and counts. Both crossings fit the desktop map. One action tray and an inline review replace the inspector/dashboard layout only for this challenge.

Pause, 1x/2x/4x, Help and Reset remain available. At the decision cutoff the existing clearance region explains the phase change and offers Watch Clearance or fast-forward on the same authoritative engine. Results count actual arrival timestamps, total completed, remaining waiting/traveling and exit-queued trips. Average delay is **request-to-arrival minus the free-flow fastest trip, per completed commuter**, including origin waiting. Incomplete results retain accrued costs and unresolved counts; incomplete versus complete costs are not comparable final results. No grades, best-move attribution or claim of optimality is added. Try Again With Same Traffic resets the same seed; Return to Monday Morning restores the existing challenge.

## Real group and action semantics

`DemandConfig.batches` schedules actual trip requests. Each cohort has an ID, label, time, origin/destination, count and default decision window. The first interval generates its batch at its end (0.25 minutes), following the existing boundary convention. All generated passengers enter normal waiting/movement/accounting; no queue or preview benefit is scripted.

- `ROUTE_GROUP {groupId, corridorId}` makes a **one-time corridor assignment** for currently waiting, undecided requests in that group, releasing them for dispatch. A corridor is a configured mandatory edge, with current valid paths before and after it. The generic engine contains no bridge IDs. Already-traveling trips, other cohorts and future requests are untouched. Storage can still block entry; the assignment is retained while waiting.
- `HOLD_GROUP {groupId, durationMinutes}` makes a **one-time hold choice** for those requests. The UI uses six simulated minutes. On expiry they use ordinary automatic routing. It is not a persistent hold on future demand. Longer validated holds are supported by the shared action API and audited as an unfavorable policy.
- An unchosen request becomes eligible for automatic routing after 12 simulated minutes. If storage prevents dispatch, any still-undecided waiting requests remain selectable; the displayed group count is the actual remainder, not its original decorative size.

Invalid/missing/already-decided groups, unavailable/disconnected/closed corridor paths and invalid hold durations are rejected atomically without advancing time or altering logs. Previews validate the same action and clone the same authoritative snapshot. Reviewed session/revision guards and worker cleanup are unchanged. Malformed file actions are rejected; a dynamically rejected replay action stops with a reason instead of looping forever.

The extension is configuration-gated and versioned as **engine profile `0.5.0+groups.1` / experimental scenario 1**, run schema 2 and snapshot 3. Monday/practice retain **`0.5.0`**, and existing Monday exports remain compatible. Group fields and assigned corridors live in copied authoritative requests/vehicles; batch/corridor configuration is deep-copied in snapshots. Configuration identities include the entire new configuration. Experimental files are imported from the experimental challenge; Monday files from Monday. Cross-scenario/profile mismatches are rejected. Rendering, the local active-playback stopwatch and worker completion timing are not replay inputs.

Scoring formulas, road storage, movement and queue accounting are unchanged. This experimental scenario declares its own fixed weights and satisfaction parameters; its numerical costs are **not comparable to Monday's costs** and are not a normalized competitive rating. Weights were fixed before the strategy audit, not adjusted to make a tested strategy win. Arrival/deadline and delay evidence below is independently measured from actual journeys.

## Timing and matched strategy evidence

Six groups of 50 are scheduled at relative minutes **0, 32, 64, 96, 128, 160**; requests become visible one quarter-minute later. They alternate residential hubs and share Bay Works as destination. At default 1x, the engine advances one simulated minute per approximately one wall-clock second; each new batch normally offers about 12 seconds before automatic dispatch. Preview pauses provide reading/decision time. There is about half a minute to observe between batches. The North restriction is announced from configuration: **07:55–09:00, 35% less comfortable capacity**. Physical storage remains 18 on North and 42 on South. Free-flow complete routes are 7 versus 15 minutes.

**Observed production active playback: 3:25 at 1x**, excluding introduction, review, the cutoff pause and other paused time. This actual browser run sent the first group North and left later groups to automatic routing; it finished at **10:22:15**, with all 300 before the target, 32.1 minutes mean completed delay, final cost 26,782.6 and no-action reference 28,774.6. The local presentation stopwatch is neither exported nor used by the engine; a controlled-clock test checks pause exclusion. This is one desktop measurement, not a cross-device timing guarantee. Accelerated playback and fast-forward are optional.

[Matched audit data](measurements/two-bridges/strategies.json): six policies × seeds 428193–428195 = 18 runs. Table shows seed 428193; fixed cohort sizes/times yield the same movement and deadline counts on these seeds, while seeded passenger tolerance changes cost slightly. All audited runs eventually completed all 300, with zero unfinished. “North overload” is integrated `max(0, occupancy / effective comfortable occupancy − 1)`, in excess-utilization-minutes, not passenger delay. Queues also form on approaches; a zero bridge-exit queue does not mean absence of a bottleneck.

| Policy | Arrived by 10:40 | Mean completed delay (min/rider) | Final cost | North overload | Nominal 1x round (s) |
| --- | ---: | ---: | ---: | ---: | ---: |
| No intervention | 300 | 34.07 | 28,774.6 | 157.10 | 202.25 |
| Every group North | 280 | 39.78 | 27,133.6 | 224.14 | 225.50 |
| Every group South | 300 | 26.40 | 22,001.1 | 0 | 202.00 |
| Alternate North/South | 300 | 26.16 | 20,393.2 | 143.37 | 201.75 |
| Middle three groups South, others North | 300 | 20.26 | 15,043.5 | 56.70 | 190.25 |
| Hold each group 90 minutes, then automatic | 180 | 117.24 | 106,539.6 | 175.42 | 282.75 |

Thus some South routing relieves actual North pressure; sending everyone South adds distance/delay/cost relative to selective routing; long holds have a substantial measured downside. North can have lower weighted cost than no intervention while missing more deadline arrivals: the objective and deadline are distinct, not a fabricated single grade. Multiple reasonable strategies produce different outcomes. This sample does not establish a universally best strategy. The deadline is permissive enough that no intervention also meets it; whether that makes a good first challenge is a human playtest question.

## Validation, browser evidence and limitations

Reproduce:

```sh
npm test
npm run build
node --import tsx scripts/audit-two-bridges.ts --out=/private/tmp/two-bridges-audit.json
npm run dev -- --host 127.0.0.1
# Production, after build:
npm exec vite -- preview --host 127.0.0.1 --port 4182 --strictPort
```

**168 tests passed in 10 files**, including all 153 pre-existing tests. Final rerun: 3.99 seconds overall; production build/TypeScript passed (Vite bundling 1.32 seconds). Focused tests cover real group membership/conservation, targeting and holds, invalid/closed/disconnected route rejection, preview/real-action parity, deep-copy snapshots, full experimental group replay through clearance, old-profile rejection, malformed/rejected replay recovery, actual deadline counting, explicit UI Preview/Apply/Cancel, hover/focus no-work and speed preservation, obsolete reset-worker rejection, completed/incomplete results, same-traffic/return actions, reduced-motion state preservation, paused feedback/reset highlight isolation and stopwatch pause exclusion. These tests use simulated workers/Canvas-free rendering and are not browser validation.

A real previously exported Monday 0.5.0 run also verified under the extended implementation with unchanged checksum **`b18607c503405c7e`**. The actual experimental production export (first group North, 50 affected) records profile `0.5.0+groups.1`, finishedAt 622.25, 22.25 minutes clearance and checksum **`5048de98674757f2`**. An [actual example export](measurements/two-bridges/example-run.json) is retained for reproducible testing. Its in-app Watch Replay completed and explicitly verified actions, cutoff/final metrics, finish metadata and deterministic state.

Real browser checks used development port 5182 and production port 4182 with actual module workers and Canvas. Completed checks include introduction, selectable group/alternatives, real worker review, keyboard Enter/Cancel/Escape, Apply and Hold, Help/return/reset, moving traffic/restriction, exact cutoff with locked interventions, Watch/pause/speed, fast-forward, completed results and the production group-action replay. Layouts were inspected at **1280×720** and **1440×900**. The inherited light-on-light review text found in early inspection was corrected. The development run reached a complete ending using a brief Hold; later development revisions were inspected through real South-route review/reset. Production was played to completion at 1x and replayed at 4x plus clearance fast-forward.

Screenshots: [introduction](measurements/two-bridges/production-intro.png), [group and alternatives](measurements/two-bridges/development-review.png), [production review](measurements/two-bridges/production-review.png), [restriction/traffic](measurements/two-bridges/production-restriction.png), [measured 3:25 ending](measurements/two-bridges/production-results-3m25.png), [verified replay](measurements/two-bridges/production-replay-verified.png). Earlier screenshots precede the final bridge-count/vehicle-spacing additions; the simulation and action semantics are the same.

**Unverified in the experimental browser flow:** completed local-file import (staging was blocked by automatic approval-review timeout), final same-traffic retry/return actions, deliberate stale/worker-error Retry, native reduced-motion preference, screen-reader/cross-browser/mobile behavior and final console audit. Unit coverage is not substituted for those checks. The fast-forward finished before a browser cancellation click could be delivered; prototype cancellation remains covered by the existing automated batch tests, not claimed as a completed prototype browser cancellation. The final feedback/reset highlight fix is covered by a focused UI test and the final suite/build, but was not rechecked in-browser after the approval timeout. Approval review delays are tooling limitations, not game frame-time evidence.

Human enjoyment, first-player comprehension, challenge difficulty, calibration, longer traffic patterns and independent accessibility remain pending. Six fixed cohorts offer limited seed diversity; no new policy is claimed optimal. Canvas glyphs represent cohorts with small display offsets, not microscopic lane-following. The single-machine 3:25 result does not certify performance elsewhere. Long holds, unreachable routes or storage cycles can still reach the configured 13:00 incomplete safety limit; fast-forward avoids a long passive wait. No accounts, telemetry, ML, reverse mode, 3D or city building were added.
