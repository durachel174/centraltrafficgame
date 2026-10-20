# Local runs and deterministic replay

The challenge export is schema **1**, engine **0.2.0**, Monday Morning scenario **1**. Original internal `SimulationRun` objects without this schema are not imported or silently upgraded. Practice remains a separate tutorial/experiment session and is not exposed as a scored challenge export.

A completed run records schema and engine versions, scenario ID/version, seed, full configuration identity, export timestamp, timestamped interventions, actual affected counts, immediate tick rewards, every final metric (including weighted objective components), and a deterministic final-state checksum. No state snapshot is stored for each tick. There are no uploads, accounts, or telemetry.

## Compatibility and validation

`configurationIdentity` includes the engine version, scenario ID/version, and an FNV-1a/64 digest of the complete scenario configuration except `seed` (which is checked separately). This covers graph, start/end, mathematical demand, scheduled events, congestion/satisfaction parameters, objective weights, forecast configuration, and progression configuration. Changing any of these invalidates comparisons/imports. Scenario versions must be bumped for intentional scenario revisions; engine versions must be bumped for deterministic state/scoring/log contract changes.

The importer checks the 2 MB limit, JSON structure, exact supported fields, versions, configuration identity, unsigned nonzero 32-bit seed, timestamps, final metric structure/ranges, trip-count conservation, component sums, supported actions, road/node references, parameter ranges, tick alignment, timing bounds, and strict chronological action order. Invalid files report a reason and leave the active session intact. Valid imports are staged; **Start Imported Replay** explicitly replaces the current run. Claimed outcomes remain unverified until replay reaches the end.

Supported actions are reroute, delay/release departures, and the existing debug spawn/restriction/clear actions. Debug actions remain identified as debug in history; they do not gain a production live control. `NO_OP` ticks are omitted from files. Maximum accepted spawn is 10,000 in an action; duration is 0–1,440 minutes; percentages are 0–1; capacity modifiers are greater than 0 and at most 1.

## Timing contract

One engine `step(action)` executes at most one action and advances exactly 0.25 simulated minutes. Logs timestamp the **end** of that interval in scenario-relative minutes. An entry at `simulationTime: 72.25` executes at the start of `[72, 72.25]`, i.e. 08:12 for Monday Morning. Decision history displays interval-start clock time. All tick timestamps are exactly representable in binary floating point.

Same-tick duplicate entries cannot arise from this engine. Imports and the existing headless replay helper explicitly **reject** duplicate or out-of-order entries. They never sort, merge, keep only one, or discard an action. Supporting simultaneous command batches would require a new, explicitly versioned engine action contract.

Replay starts at the scenario's original 07:00 state with the recorded seed, then feeds the same action stream into the same engine. It does not start from a practice checkpoint or a final snapshot. Live actions, preview requests, Apply, and development interventions are blocked in replay. Pause/speed affect wall time only. Reset becomes **Restart Replay**; **Try This Seed Again** exits replay into a fresh live challenge.

## Final verification

At completion, replay compares the complete executed action log (including actual affected counts and tick rewards), **every final metric** using exact canonical JSON equality, and the final simulation snapshot checksum. The snapshot covers graph/vehicle/trip state and progress, RNG state, demand carry/ID state, accumulated costs, rewards, action logs and affected counts, event IDs, temporary restrictions, forecasts/alerts, and forecast bookkeeping. `scenario.seed` is normalized to the effective snapshot seed so a caller's explicit `reset(seed)` has the same representation as a session configured with that seed.

Canonical JSON normalizes through JSON serialization (omits undefined object properties), sorts object keys recursively, and preserves array order. The checksum is FNV-1a/64 over the resulting UTF-16 code units, with unsigned 64-bit overflow after each multiplication, returned as 16 lowercase hexadecimal characters. It detects accidental inconsistency; it is not an authentication signature. Verification assumes compatible JavaScript number behavior and exactly matching versions/configuration. A mismatch is shown as failed verification; it is never relabeled as success. Re-export from replay is enabled only after successful verification.

## Baseline and history

Baseline rollouts execute in a dedicated worker, with no blocking main-thread fallback. Results/cache keys include engine/scenario/configuration identity and seed. Reset or scenario/seed changes terminate obsolete jobs; obsolete responses cannot install results. A failed or unavailable worker leaves the comparison unavailable with **Retry Baseline**. The small in-memory cache retains at most eight matching results.

The baseline uses the same deterministic engine, demand, events, scoring weights, seed, and full start/end, with no intervention. Results display each weighted component and the total in cost units. Positive percentage improvement means lower system cost; negative means higher cost. Travel-time statistics cover completed dispatch-to-arrival trips, while satisfaction and system cost include unfinished trips as described in [traffic-model.md](traffic-model.md).

History comes from actual applied engine log entries, outside rendering and outside preview calculation. The affected count is the executed count, not a preview estimate. Immediate cost change is `-immediateReward`, including traffic evolution during the whole tick; it does not establish an action's isolated or long-term causal impact. History makes no best/worst ranking. Canceled previews leave no history entry.
