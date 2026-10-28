# Desktop playtest: Central Traffic

**Human participant sessions pending.** This is a 15–20 minute moderator-led session, with anonymous notes and no telemetry. Automated/browser checks do not establish comprehension or enjoyment. Current compatibility: engine **0.5.0**, Monday Morning **4**, run schema **2**, snapshot **3**.

## Prepare the first session

1. Record `git rev-parse HEAD`. Run `npm install` if needed, `npm run build`, then `npm exec vite -- preview --host 127.0.0.1 --port 4173 --strictPort`.
2. Open the printed local URL in a fresh browser profile/private window so first-time practice appears. If the tutorial was already completed, use Help → Replay Tutorial → Start Practice; record that preparation. Confirm comfortable zoom, viewport and input/reduced-motion preferences. Obtain separate consent for any recording; handwritten anonymous notes suffice.
3. Copy the blank sheet below. Start timing at the first actionable practice screen and at Monday start. Separate running, paused/reading and assistance time. Do not impose a target score or prescribe a road/action. Ask “What would you try?” before assisting; if blocked, give the smallest help and quote it in the sheet. Stop a frustrating task if requested.

## Read to the participant

“Thank you for trying Central Traffic. We are testing the game, not you. Please say what you notice and what you expect as you play. You can use the keyboard, mouse, pause and Help. Some choices may make traffic worse. There is no required score. You may stop at any time. I will mostly watch so we can learn which parts explain themselves.”

## Tasks to give one at a time

1. “Try the first-time practice. Follow or skip the guidance as you choose, then spend a moment experimenting in free practice.” Record completion/skipping and whether Continue Practice is found.
2. “Find an intervention you might use. Read its preview and decide whether to apply or cancel. Tell me what you expect on this road and elsewhere.” Let the participant choose. If possible, observe both Apply and Cancel over two previews; record anything not encountered. Hovering or a zero-affected preview alone is not an informed decision.
3. “Start Monday Morning and manage the commute as you think best. Say when something needs attention.” Observe the 08:12 bridge incident and 08:27 restoration without pointing them out. If unnoticed, ask afterward what changed. Do not equate restoration with traffic clearance.
4. At the 09:00 pause: “What has changed? Continue toward results in a way that makes sense to you.” First observe discovery unaided; then, if necessary, ask them to try Watch Clearance, pause/speed, Fast-forward and cancellation back to watching. Record assistance. Waiting trips can still enter roads; no new requests or interventions occur. Do not read that explanation aloud before they interpret it.
5. At results: “What does this result tell you? What, if anything, is unfinished?” Ask what the baseline and cost direction mean. Observe desire to retry **before** asking: “If you wanted another attempt with the same traffic, what would you do?” Have them use Try This Seed Again and check the seed matches. No need to finish a second round.

Let them pause to read. Record actual durations: wall time includes pauses, worker calculations, clearance and discussion. A second run is optional. Incomplete results need not arise naturally; record whether seen. A moderator may separately demonstrate the documented incomplete replay fixture after the tasks, explicitly labeling it a prepared example rather than participant performance.

## Moderator observation sheet

Copy per anonymous session; write “not observed” rather than estimating. Quote participant statements separately from interpretation. Do not collect names/contact details.

| Context | Record |
| --- | --- |
| Session code / date / moderator | |
| Commit / engine / scenario / schema | |
| Browser / OS / viewport / zoom | |
| Input / reduced motion / prior familiarity | |
| Practice seed / Monday seed / retry seed | |
| Interruptions / recording consent if applicable | |

| Task / observation | Time, evidence, assistance or problem |
| --- | --- |
| Practice start / complete or skip / free practice reached | |
| First informed preview: goal, affected trips, other-road effect, cost | |
| Preview ready / Apply executed / Cancel recovered / time resumed | |
| Monday start / incident noticed / restoration interpreted | |
| 09:00 pause: spontaneous interpretation / locked actions understood | |
| Watch / pause / speed / fast-forward / cancel progress retained | |
| Results time / running vs paused or discussion time | |
| Complete or incomplete / counts / cost direction / baseline interpreted | |
| Spontaneous desire to retry (quote before retry task) | |
| Same-seed retry found / seed matches / fresh run | |
| Assistance: count, exact words, task, assisted or unassisted outcome | |
| Problems: clock, seed, input steps, expected vs actual, severity | |
| Confusing/inactive stretches: start/end, intentional waiting or blocked? | |
| Keyboard traps / unreadable text / errors / screenshot if consented | |

An **informed decision** is a concrete action considered after reading a ready preview, with a stated road-level goal and at least one cost or alternative-road consequence. A reasoned Cancel counts. Mark explanations requested afterward as retrospective; do not backdate comprehension. Apply requires observed execution/feedback. Cancel requires unchanged decision history and a usable return to play. For problems use severity: blocked / assistance needed / recoverable confusion. Save local runs only with participant agreement.

## Questions after play

- What were you trying to achieve, and how did you judge progress?
- What did the preview help you decide? Which tradeoff or other-road effect was unclear? How did projections differ from what you later observed?
- What ended at 09:00? What continued? What did Watch and Fast-forward do? Was canceling understandable?
- What do final cost, baseline improvement and unfinished trips mean? If shown an incomplete result, how does it differ from a completed one?
- When did play feel rushed, slow or unresponsive? Was there time to observe an intervention?
- Would you choose another attempt? Why, and what would you try differently?

## After real sessions

Summarize build/seeds, participant count, assisted/unassisted outcomes, obstacles with quotes, and contradictory cases. Separate usability, performance and scoring/model questions. Do not invent feedback, infer understanding from clicks/scores, or generalize a small sample to all players. Human testing, independent screen-reader/cross-browser checks, broader calibration and cross-device performance remain pending; Phase 12 stays IN PROGRESS.

## Focused Two Bridges session (5–10 minutes)

Use the current production build and select **Two Bridges · Experimental**. This is a separate short session; the Monday tasks above are optional afterward. Current challenge: scenario **2**, engine **0.5.0+groups.1**, schema **2**, snapshot **3**. Record commit/version, seed, browser/OS, viewport/zoom, input/reduced-motion preference and prior familiarity using the context sheet. Do not show the strategy audit or prescribe crossings. Human sessions remain pending.

Read the same neutral introduction above, then give only this task:

“Get 280 commuters to Bay Works by 10:15. Use the available controls as you think best.”

Let the participant choose pause, Help, previews, routes and clearance controls. Record running time separately from paused reading, discussion and assistance. Observe unaided first; ask neutral questions afterward rather than pointing out groups or recommending South. Do not interpret a target-met result as proof of understanding or enjoyment.

| Observe | Time / behavior / assistance / exact quote |
| --- | --- |
| Explains goal, arrival deadline and what counts as progress | |
| Notices pending groups and understands automatic eligibility versus road entry | |
| Roughly 12-second unpaused window: manageable, rushed, or missed? Which groups? | |
| Preview → review → Apply/Cancel; expected effect versus observed outcome | |
| Chosen routes/holds per group; reasons stated before or after choosing | |
| Notices actual arrivals and bridge congestion | |
| Explains whether/why routing some groups South could help | |
| Pauses: count, start/end, reading/decision or other reason | |
| Assistance: exact words, group/clock, assisted or unassisted outcome | |
| Outcome: arrivals by 10:15, total complete/unfinished, clearance status | |
| Spontaneous desire to retry; different plan proposed; retry seed matches | |
| Unreadable controls, focus loss, problems and participant quotes | |

After play ask: “What were you aiming for, and how did you know how you were doing?” “What happened when a group became eligible?” “How did the decision time feel?” “What did Preview, Apply and Cancel do?” “What changes did you notice on the map?” “What did the two crossings offer?” “Would you try again? What would you change?” If their explanation does not mention routing tradeoffs, ask “Could sending some groups South help? Why or why not?” Record that as prompted, not spontaneous. Ask about retry before requesting any retry action. A second round is optional.

Keep observations, quotes and moderator interpretations separate. Record “not observed” for unused controls. Do not invent feedback, reveal a winning policy or equate the passing strategy audit with enjoyment.
