# Desktop playtest: Central Traffic

Status: **participant sessions pending**. This is a moderator-led local test, not a telemetry system. Automated checks do not establish fun or comprehension. Use the production build (`npm run build`, then `npm exec vite preview -- --host 127.0.0.1 --port 4173`). Record the build commit, engine/scenario version, browser, viewport and seed before each session. Current compatibility: engine 0.3.0 / Monday Morning 2.

## Read to the participant

“Thank you for trying Central Traffic. We are testing the game, not you. Please say what you notice and what you expect as you play. You can use the keyboard, mouse, pause and Help. Some choices may make traffic worse. There is no required score. You may stop at any time. I will mostly watch so we can learn which parts explain themselves.”

## Tasks, in order

1. Complete practice. Use Help → Replay Tutorial → Start Practice if the browser has already completed the tutorial. Let the participant choose whether to skip; record it.
2. Start Monday Morning and finish the round. Do not suggest a particular road, action or speed. Ask the participant to say when they believe an intervention would be useful.
3. Ask: “Pick one intervention you considered. Explain what you expected on that road, what could happen on other roads, and why you applied or canceled it.” If none was considered, record that and ask what they thought the controls would do.
4. At results ask: “What does this result tell you? What is still unfinished?” Then: “If you wanted another attempt with the same traffic, what would you do?” Record whether they find and use Try This Seed Again. Separately record whether they **want** to retry without being asked to perform the task.

Allow roughly 15–20 minutes, including discussion. Do not hurry someone who pauses to read. A 1× Monday simulation takes roughly two minutes of running wall time, plus pauses, processing delays and discussion; 4× is faster. Record actual times instead of assuming this duration.

## Moderator checklist

- Use a fresh local test session/profile if possible; record prior familiarity and input preference. No participant names or contact details are needed. Obtain separate consent before any recording; handwritten anonymous notes are sufficient.
- Check the build is production, sound/zoom/preferences are comfortable, and the full desktop viewport is visible. Ask about keyboard or reduced-motion preferences; record configuration rather than assuming accessibility coverage.
- Start a stopwatch at the first actionable practice screen and again when Monday begins. Note pauses and interruption time separately.
- Read the tasks neutrally. Avoid “the right choice,” naming the best road, interpreting the forecast, or pointing to Apply/Cancel.
- When asked for help, first say: “What would you try?” If blocked, give the smallest assistance, quote it in the notes, and mark the task assisted. Stop a frustrating task if requested.
- Observe preview/review/apply/cancel separately. Do not count hovering, selecting a road, or a zero-affected action as an informed intervention.
- Note the seed at Monday start/results/retry, actual trip counts, and unexpected behavior. Save a completed local run only with the participant's agreement; files remain on this machine.
- Distinguish participant statements from moderator interpretations. Do not infer understanding solely from a successful click or a high score.

## Measures and observation sheet

Copy this block for each anonymous session. Write “not observed” instead of estimating missing data.

| Context | Record |
| --- | --- |
| Session code / date | |
| Build commit / engine / scenario | |
| Browser / OS / viewport / zoom | |
| Keyboard / mouse / reduced motion preference | |
| Prior game familiarity | |
| Practice seed / Monday seed / retry seed | |
| Session interruptions | |

| Observable measure | Time, count or evidence |
| --- | --- |
| Practice start / completion / skipped | |
| Monday start / finish; running time versus paused/discussion time | |
| First warning noticed | |
| First informed intervention considered / applied / canceled | |
| Time to first informed intervention from Monday start | |
| Participant's stated rationale, including alternative-road consequences | |
| Preview requested / ready review read / Apply executed / Cancel recovered | |
| Assistance count, exact assistance, task affected | |
| Confusing stretches (start/end, what participant said/did) | |
| Inactive stretches (start/end, whether intentional waiting/observation) | |
| Can explain observed outcomes versus projections? Quote evidence | |
| Can explain completed versus unfinished trips and cost direction? | |
| Same-seed retry found / task completed / seed matches | |
| Spontaneous wish to retry before moderator retry task? Exact quote | |
| Errors, keyboard traps, unreadable text or blocked controls | |

An **informed intervention** means the participant considers a concrete action after reading its ready preview and can state a road-level goal plus at least one possible cost or other-road effect. Application is not required; a reasoned Cancel counts. If explanation is requested only afterward, label it retrospective and do not backdate an inferred understanding time. A successful Apply requires observed execution/feedback; a successful Cancel requires no action recorded and a usable route back to play.

For problems, record: task, simulation clock, wall time, seed, expected behavior, actual behavior, input steps, severity (blocked / assistance needed / recoverable confusion), and screenshot or run filename if consented. Do not include personal information.

## Questions after play

- What were you trying to achieve? How did you know whether you were doing well?
- What did a preview tell you? What information, if any, was missing before you applied or canceled?
- What could happen on another road after rerouting? How would you check?
- When did you feel you had time to observe a result? When did decisions arrive too quickly or too slowly?
- Which feedback felt clear or confusing? Did the result reflect what you expected?
- Would you choose another attempt? Why or why not? What would you change next time?

## Synthesis after real sessions

Report participant count, input preferences, build/seeds and assisted/unassisted outcomes. Summarize observed obstacles with evidence and contradictory cases. Separate usability findings, performance bugs and scoring/model questions. Do not turn this small qualitative sample into claims about all players, optimal strategy, or universal accessibility. Keep Phase 12 IN PROGRESS until its remaining acceptance conditions are actually verified.
