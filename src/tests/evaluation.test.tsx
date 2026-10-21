import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrafficEnvironment } from "../simulation/environment/TrafficEnvironment";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import { createCompletedRun, finalStateChecksum, parseRunFile, verifyCompletedRun } from "../simulation/logging/RunFile";
import { actionForReplayTick } from "../simulation/logging/Replay";
import { baselineIdentity } from "../simulation/logging/Identity";
import { calculateBaseline } from "../workers/baselineWorker";
import { calculateForecast } from "../workers/forecastWorker";
import { useGameStore } from "../game/GameStore";
import { ScenarioStatus } from "../components/ScenarioStatus";
import { RoadInspector } from "../components/RoadInspector";
import { App } from "../components/App";
import { EndScreen } from "../components/EndScreen";
import type { Scenario, SimulationAction, Vehicle } from "../simulation/types";

const fixture = (overrides: Partial<Scenario> = {}): Scenario => ({
  ...mondayMorningScenario, id: "evaluation_fixture", name: "Evaluation fixture", seed: 7, startTime: 0, endTime: .5,
  evaluation: { maxClearanceMinutes: 5 }, events: [], congestion: { alpha: 0, beta: 4, utilizationThreshold: .82 },
  graph: { nodes: ["a", "b", "d"].map((id, x) => ({ id, x, y: 0, type: "intersection" as const })),
    edges: [["north_bridge", "a", "b"], ["south_bridge", "b", "d"]].map(([id, from, to]) => ({ id, from, to, lengthKm: .25, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20, major: true })) },
  demand: { curve: [{ minute: 0, tripsPerMinute: 4 }], pairs: [{ origin: "a", destination: "d", weight: 1 }], passengerTolerance: [10, 10] },
  forecast: { horizonsMinutes: [.25, .5, .75], previewHorizonMinutes: .75, refreshIntervalMinutes: .25, warningUtilization: 1, criticalUtilization: 1.25 },
  ...overrides
});
const make = (scenario = fixture()) => { const e = new SimulationEngine(scenario, undefined, true); e.reset(7); return e; };
const finish = (e: SimulationEngine) => { while (!e.isDone()) e.step(); return e; };
const hold: SimulationAction = { type: "DELAY_DEPARTURES", percentage: 1, durationMinutes: 2 };
class WorkerDouble {
  static all: WorkerDouble[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  request: any; terminated = false;
  constructor(readonly url: URL) { WorkerDouble.all.push(this); }
  postMessage(request: any) { this.request = request; }
  terminate() { this.terminated = true; }
  reply() {
    const r = this.request;
    const e = new SimulationEngine(r.snapshot.scenario, undefined, true); e.restoreFromSnapshot(r.snapshot);
    const data = r.kind === "forecast" ? calculateForecast(r) : { requestId: r.requestId, sessionId: r.sessionId, result: e.previewAction(r.action), timings: { calculationMs: 1, roundTripStartedAt: 0 } };
    this.onmessage?.({ data } as MessageEvent);
  }
}
let root: ReturnType<typeof createRoot> | null = null, host: HTMLDivElement;
function mount(ui: React.ReactNode) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); act(() => root!.render(ui)); return host; }
function click(text: string) { const b = [...host.querySelectorAll("button")].find(b => b.textContent === text); expect(b).toBeTruthy(); act(() => b!.click()); }
function install(e = make()) {
  useGameStore.getState().setScenarioMode("monday", 7);
  useGameStore.setState({ engine: e, scenario: e.exportSnapshot().scenario, seed: e.exportSnapshot().seed, speed: 0, baseline: { status: "idle", identity: null, metrics: null, calculationMs: null, error: null } });
  return e;
}
function UI() { const { engine } = useGameStore(); return engine.isDone() ? <EndScreen /> : <><ScenarioStatus /><RoadInspector /></>; }
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("Worker", WorkerDouble); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); WorkerDouble.all = []; });
afterEach(() => { if (root) act(() => root!.unmount()); root = null; host?.remove(); useGameStore.getState().setScenarioMode("practice"); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("authoritative decision and evaluation boundaries", () => {
  it("exposes serializable phase and rejection reasons through the environment API", () => {
    const env = new TrafficEnvironment(fixture()); env.reset(7); env.step(); env.step();
    expect(JSON.parse(JSON.stringify(env.getEvaluation())).phase).toBe("clearance");
    expect(env.getDecisionCutoffMetrics()!.tripsRequested).toBe(2);
    expect(env.step(hold).info.actionRejected).toMatch(/Decisions are closed/);
    expect(env.getEvaluation().elapsedClearanceMinutes).toBe(0);
  });
  it("preserves the last demand cohort, exposes phases and rejects clearance actions atomically", () => {
    const e = make(); expect(e.getEvaluation().phase).toBe("decision"); e.step();
    expect(e.getObservation().metrics.tripsRequested).toBe(1); e.step();
    expect(e.isDone()).toBe(false); expect(e.getEvaluation()).toMatchObject({ phase: "clearance", decisionCutoff: .5, elapsedClearanceMinutes: 0, evaluationLimit: 5.5 });
    expect(e.getState().waiting[0].requestedDepartureTime).toBe(.5);
    expect(e.getObservation().metrics.tripsRequested).toBe(2);
    const snapshot = e.exportSnapshot(), checkpoint = e.getDecisionCutoffMetrics();
    const rejection = e.step(hold); expect(rejection.info.actionRejected).toMatch(/Decisions are closed/); expect(rejection.done).toBe(false);
    expect(e.exportSnapshot()).toEqual(snapshot);
    while (!e.isDone()) { e.step(); expect(e.getObservation().metrics.tripsRequested).toBe(2); expect(e.getDecisionCutoffMetrics()).toEqual(checkpoint); }
    expect(e.getEvaluation()).toMatchObject({ phase: "finished", finishReason: "all-arrived", finishedAt: 1, elapsedClearanceMinutes: .5 });
    expect(e.getState().metrics.tripsCompleted).toBe(2);
    const final = e.exportSnapshot(); e.step(); expect(e.exportSnapshot()).toEqual(final);
  });
  it("realizes hold waiting once, without adding the historical cutoff estimate", () => {
    const e = make(); e.step(); e.step(hold);
    const cutoff = e.getDecisionCutoffMetrics()!;
    expect(cutoff.departureDelay).toBe(.25); expect(cutoff.remainingHoldPassengerMinutes).toBe(1.75);
    expect(cutoff.objectiveBreakdown!.terminalHoldDelay).toBeCloseTo(1.75 * 2.2);
    finish(e); expect(e.getState().metrics.departureDelay).toBe(2);
    expect(e.getState().metrics.remainingHoldPassengerMinutes).toBe(0); expect(e.getState().metrics.objectiveBreakdown!.terminalHoldDelay).toBe(0);
    expect(e.getState().metrics.objectiveBreakdown!.travelTime).toBe(1); expect(e.getDecisionCutoffMetrics()).toEqual(cutoff);
  });
  it("charges only travelled excess distance at an incomplete limit, not untravelled planned kilometres", () => {
    const scenario = fixture({ evaluation: { maxClearanceMinutes: .25 }, demand: { ...fixture().demand, curve: [{ minute: 0, tripsPerMinute: 0 }] } });
    scenario.graph.edges[1].lengthKm = 2;
    const e = make(scenario), snapshot = e.exportSnapshot();
    snapshot.vehicles = [{ id: "partial", origin: "a", destination: "d", route: ["north_bridge", "south_bridge"], currentEdgeIndex: 0, edgeProgress: 1, distanceKm: .25, requestedDepartureTime: 0, actualDepartureTime: 0, baselineTravelTime: .5, baselineDistanceKm: .5, passengerTolerance: 10, satisfaction: 100, rerouteCount: 0, status: "traveling" }];
    snapshot.graph.edges[0].currentVehicleCount = 1; e.restoreFromSnapshot(snapshot); finish(e);
    const vehicle = e.getState().vehicles[0]; expect(vehicle.status).toBe("traveling");
    expect(e.getState().metrics.excessDistance).toBeCloseTo(Math.max(0, vehicle.distanceKm - vehicle.baselineDistanceKm));
    expect(e.getState().metrics.excessDistance).toBeLessThan(1.75);
  });
  it("keeps holds, future scheduled restoration and temporary restrictions through clearance", () => {
    const e = make(fixture({ events: [{ id: "event", title: "Restriction", type: "CAPACITY_REDUCTION", edgeId: "north_bridge", time: .5, duration: .5, capacityModifier: .5 }] }));
    e.step({ type: "DEBUG_INCIDENT", edgeId: "south_bridge", capacityModifier: .5, durationMinutes: 1.25 }); e.step(hold); e.step();
    expect(e.getInfo().activeEventIds).toEqual(["event"]); expect(e.graph.edge("south_bridge").capacityModifier).toBe(.5);
    e.step(); e.step(); expect(e.graph.edge("north_bridge").capacityModifier).toBe(1);
    e.step(); expect(e.graph.edge("south_bridge").capacityModifier).toBe(1); finish(e);
    expect(e.getState().metrics.tripsRequested).toBe(2); expect(e.getState().metrics.tripsCompleted).toBe(2); expect(e.createRun().actions).toHaveLength(2);
  });
  it.each(["unreachable", "long hold"])("honestly caps %s with unresolved passengers and no extra penalty", kind => {
    const scenario = fixture({ evaluation: { maxClearanceMinutes: 1 } });
    if (kind === "unreachable") scenario.graph.edges = [];
    const e = make(scenario); e.step(); e.step(kind === "long hold" ? { ...hold, durationMinutes: 100 } : undefined); finish(e);
    expect(e.getEvaluation()).toMatchObject({ finishReason: "safety-limit", finishedAt: 1.5 });
    const m = e.getState().metrics; expect(m.tripsRequested).toBe(2); expect(m.tripsCompleted + m.activeTrips + m.waitingTrips).toBe(2);
    expect(m.waitingTrips).toBeGreaterThan(0); expect(m.objectiveBreakdown!.terminalHoldDelay).toBe(0);
  });
  it("preserves a full reachable storage cycle until the configured safety limit", () => {
    const scenario = fixture({ evaluation: { maxClearanceMinutes: 1 }, demand: { ...fixture().demand, curve: [{ minute: 0, tripsPerMinute: 0 }] } });
    scenario.graph.edges.push({ ...scenario.graph.edges[0], id: "back", from: "d", to: "a" }); scenario.graph.edges.forEach(e => e.maximumCapacity = 1);
    const e = make(scenario), s = e.exportSnapshot(); s.time = .25;
    s.vehicles = [["a", "d", "north_bridge", "south_bridge"], ["b", "a", "south_bridge", "back"], ["d", "b", "back", "north_bridge"]].map(([origin, destination, first, second], i): Vehicle => ({ id: `cycle_${i}`, origin, destination, route: [first, second], currentEdgeIndex: 0, edgeProgress: 1, distanceKm: .25, requestedDepartureTime: 0, actualDepartureTime: 0, baselineTravelTime: .5, baselineDistanceKm: .5, passengerTolerance: 10, satisfaction: 100, rerouteCount: 0, status: "traveling" }));
    s.graph.edges.forEach(edge => edge.currentVehicleCount = 1); e.restoreFromSnapshot(s); finish(e);
    expect(e.getEvaluation().finishReason).toBe("safety-limit"); expect(e.getState().metrics.inNetworkQueuedTrips).toBe(3);
    expect(e.getState().vehicles.every(v => v.distanceKm === .25 && v.edgeProgress === 1)).toBe(true);
  });
  it("previews cross the cutoff with no new demand or terminal estimate and preserve source state", () => {
    const e = make(); e.step(); const source = e.exportSnapshot(), preview = e.previewAction(hold);
    const action = make(), none = make(); action.restoreFromSnapshot(source); none.restoreFromSnapshot(source);
    action.step(hold); none.step(); for (let i = 0; i < 2; i++) { action.step(); none.step(); }
    expect(preview.includesClearance).toBe(true); expect(preview.horizonMinutes).toBe(.75); expect(preview.affectedVehicles).toBe(1);
    expect(preview.networkCostDelta).toBe(action.getState().metrics.objective - none.getState().metrics.objective);
    expect(preview.terminalHoldDeltaPassengerMinutes).toBe(0); expect(action.getState().metrics.tripsRequested).toBe(2);
    expect(e.exportSnapshot()).toEqual(source); expect(() => action.previewAction(hold)).toThrow(/Decisions are closed/);
  });
  it("labels a shared review horizon when action branches finish at different times", () => {
    const scenario = fixture({ forecast: { horizonsMinutes: [1, 2, 4], previewHorizonMinutes: 4, refreshIntervalMinutes: .25, warningUtilization: 1, criticalUtilization: 1.25 } });
    const e = make(scenario); e.step();
    const result = e.previewAction({ ...hold, targetEdge: "north_bridge" });
    expect(result.baselineHorizonMinutes).toBe(.75); expect(result.actionHorizonMinutes).toBe(2.5);
    expect(result.horizonMinutes).toBe(2.5); expect(result.truncated).toBe(true);
    expect(result.forecastChanges.find(change => change.edgeId === "north_bridge" && change.actualHorizonMinutes === result.horizonMinutes)).toMatchObject({ before: 0, after: 0 });
  });
  it.each([false, true])("exports and verifies complete/incomplete runs (incomplete=%s), rejecting changed finish metadata and old formats", incomplete => {
    const scenario = fixture({ evaluation: { maxClearanceMinutes: 1 } }); if (incomplete) scenario.graph.edges = [];
    const e = finish(make(scenario)), file = createCompletedRun(e);
    expect(file.schemaVersion).toBe(2); expect(file.decisionCutoffMetrics.tripsRequested).toBe(2);
    const imported = parseRunFile(JSON.stringify(file), scenario), replay = make(scenario);
    while (!replay.isDone()) replay.step(actionForReplayTick(imported, replay.getState().time + .25));
    expect(verifyCompletedRun(replay, imported)).toBeNull();
    expect(() => parseRunFile(JSON.stringify({ ...file, schemaVersion: 1 }), scenario)).toThrow(/schema/);
    expect(() => parseRunFile(JSON.stringify({ ...file, engineVersion: "0.4.0" }), scenario)).toThrow(/engine/);
    expect(() => parseRunFile(JSON.stringify({ ...file, actions: [{ simulationTime: .75, stateSnapshotId: "t_0.75", action: hold, affectedCount: 1, immediateReward: 0 }] }), scenario)).toThrow(/scenario/);
    expect(() => parseRunFile(JSON.stringify({ ...file, evaluation: { ...file.evaluation, finishReason: incomplete ? "all-arrived" : "safety-limit" } }), scenario)).toThrow(/finish reason/);
  });
});

describe("player-visible clearance and bounded live fast-forward", () => {
  it("stops a 4x playback group on the exact decision boundary", async () => {
    const e = install(); e.step(); mount(<App />);
    act(() => useGameStore.getState().setSpeed(4));
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(e.getState().time).toBe(.5); expect(e.getEvaluation().elapsedClearanceMinutes).toBe(0);
    expect(useGameStore.getState().speed).toBe(0); expect(e.getState().waiting[0].requestedDepartureTime).toBe(.5);
  });
  it("transitions accessibly, cancels pending previews and ignores obsolete replies", () => {
    const e = install(); mount(<UI />); act(() => { useGameStore.getState().step(); useGameStore.getState().requestPreview(hold); });
    const pending = WorkerDouble.all.find(w => w.request?.action)!;
    act(() => useGameStore.getState().step());
    expect(e.getEvaluation().phase).toBe("clearance"); expect(pending.terminated).toBe(true);
    expect(useGameStore.getState().preview.status).toBe("idle"); expect(useGameStore.getState().speed).toBe(0);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Clearance controls");
    expect(host.textContent).toContain("Waiting trips can still enter roads"); expect(host.textContent).toContain("No new trips are entering demand");
    expect([...host.querySelectorAll('.actionChoice button')].every(b => (b as HTMLButtonElement).disabled)).toBe(true);
    act(() => pending.reply()); expect(useGameStore.getState().preview.status).toBe("idle");
    click("Watch Clearance"); expect(useGameStore.getState().speed).toBe(1);
  });
  it("watch and fast-forward use identical ticks, metrics, logs, checkpoint and final checksum", async () => {
    const e = install(); mount(<UI />); act(() => { useGameStore.getState().step(); useGameStore.getState().step(hold); });
    const watch = make(); watch.restoreFromSnapshot(e.exportSnapshot()); finish(watch);
    click("Fast-forward to Results"); expect(useGameStore.getState().fastForwarding).toBe(true);
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(e.isDone()).toBe(true); expect(e.createRun()).toEqual(watch.createRun()); expect(finalStateChecksum(e.exportSnapshot())).toBe(finalStateChecksum(watch.exportSnapshot()));
    expect(host.textContent).toContain("Final realized system cost"); expect(host.textContent).toContain("Cost at decision cutoff");
  });
  it("canceling batches keeps progress and reset isolates queued work", async () => {
    const e = install(make(fixture({ evaluation: { maxClearanceMinutes: 30 } })));
    mount(<UI />); act(() => { useGameStore.getState().step(); useGameStore.getState().step({ ...hold, durationMinutes: 20 }); });
    click("Fast-forward to Results"); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const progressed = e.getState().time; expect(progressed).toBeGreaterThan(.5); expect(e.isDone()).toBe(false);
    click("Cancel Fast-forward · Watch Clearance"); expect(useGameStore.getState().fastForwarding).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(20); }); expect(e.getState().time).toBe(progressed);
    click("Fast-forward to Results"); act(() => useGameStore.getState().newSeed());
    const reset = useGameStore.getState().engine.exportSnapshot();
    await act(async () => { await vi.advanceTimersByTimeAsync(50); }); expect(useGameStore.getState().engine.exportSnapshot()).toEqual(reset);
  });
  it("fast-forward rejects obsolete clearance forecast replies and restores a fresh source on cancel", async () => {
    const e = install(make(fixture({ evaluation: { maxClearanceMinutes: 30 } })));
    mount(<UI />); act(() => { useGameStore.getState().step(); useGameStore.getState().step({ ...hold, durationMinutes: 20 }); });
    const old = WorkerDouble.all.filter(w => w.request?.kind === "forecast").at(-1)!;
    click("Fast-forward to Results"); expect(old.terminated).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); }); click("Cancel Fast-forward · Watch Clearance");
    const current = WorkerDouble.all.filter(w => w.request?.kind === "forecast").at(-1)!;
    act(() => old.reply()); expect(useGameStore.getState().forecastView.sourceTime).toBeNull();
    act(() => current.reply()); expect(useGameStore.getState().forecastView.sourceTime).toBe(e.getState().time);
  });
  it("shows an incomplete player separately from a completed matching no-action baseline", () => {
    const scenario = fixture({ evaluation: { maxClearanceMinutes: 1 } }), e = make(scenario);
    e.step(); e.step({ ...hold, durationMinutes: 20 }); finish(e); install(e);
    const baseline = calculateBaseline({ kind: "baseline", scenario, seed: 7 });
    useGameStore.setState({ baseline: { ...baseline, status: "ready", identity: baselineIdentity(scenario, 7), metrics: baseline.metrics!, error: null } });
    mount(<UI />); expect(host.textContent).toContain("All trips arrived"); expect(host.textContent).toContain("Evaluation incomplete");
    expect(host.textContent).not.toContain("Improvement (higher is better)"); expect(host.textContent).toContain("Not comparable until both evaluations complete");
  });
  it("does not award improvement when the player completes but the matching baseline is incomplete", () => {
    const scenario = fixture({ evaluation: { maxClearanceMinutes: .5 }, congestion: { alpha: .15, beta: 4, utilizationThreshold: .82 },
      events: [{ id: "slow", title: "Persistent restriction", type: "CAPACITY_REDUCTION", time: 0, duration: 10, edgeId: "north_bridge", capacityModifier: .1 }] });
    scenario.graph.edges[0].lengthKm = .3; scenario.graph.edges[1].lengthKm = .05;
    const e = make(scenario); e.step(); e.step({ type: "DEBUG_CLEAR_INCIDENT", edgeId: "north_bridge" }); finish(e); install(e);
    const baseline = calculateBaseline({ kind: "baseline", scenario, seed: 7 });
    expect(e.getEvaluation().finishReason).toBe("all-arrived"); expect(baseline.evaluation!.finishReason).toBe("safety-limit");
    useGameStore.setState({ baseline: { ...baseline, status: "ready", identity: baselineIdentity(scenario, 7), metrics: baseline.metrics!, error: null } });
    mount(<UI />); expect(host.textContent).toContain("No-action baseline accrued cost through limit");
    expect(host.textContent).not.toContain("Improvement (higher is better)"); expect(host.textContent).toContain("The baseline is incomplete");
  });
  it("a full Monday Morning watched rollout and batched UI rollout verify identically", async () => {
    const e = new SimulationEngine(mondayMorningScenario, undefined, true); e.reset(428193);
    for (let tick = 0; e.decisionsOpen(); tick++) e.step(tick === 120 ? { type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: .25 } : { type: "NO_OP" });
    const watch = new SimulationEngine(mondayMorningScenario, undefined, true); watch.restoreFromSnapshot(e.exportSnapshot()); finish(watch);
    install(e); mount(<UI />); click("Fast-forward to Results");
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(e.getEvaluation().finishReason).toBe("all-arrived"); expect(e.createRun()).toEqual(watch.createRun());
    const file = parseRunFile(JSON.stringify(createCompletedRun(e)), mondayMorningScenario);
    expect(verifyCompletedRun(watch, file)).toBeNull();
    expect(finalStateChecksum(e.exportSnapshot())).toBe(finalStateChecksum(watch.exportSnapshot()));
  }, 10000);
  it("shows statuses and separate accrued costs, with no improvement percentage for either incomplete branch", () => {
    const scenario = fixture({ evaluation: { maxClearanceMinutes: .25 } }), e = finish(make(scenario)); install(e);
    const baseline = calculateBaseline({ kind: "baseline", scenario, seed: 7 });
    useGameStore.setState({ baseline: { ...baseline, status: "ready", identity: baselineIdentity(scenario, 7), metrics: baseline.metrics!, error: null } });
    mount(<UI />); expect(host.textContent).toContain("Evaluation incomplete"); expect(host.textContent).toContain("not full-journey costs");
    expect(host.textContent).toContain("Baseline evaluation"); expect(host.textContent).not.toContain("Improvement (higher is better)"); expect(host.textContent).toContain("Not comparable until both evaluations complete");
  });
});
