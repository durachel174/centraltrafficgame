import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import { practiceScenario } from "../simulation/scenarios/PracticeScenario";
import { createCompletedRun, parseRunFile, verifyCompletedRun, type CompletedRun } from "../simulation/logging/RunFile";
import { actionForReplayTick, replayRun } from "../simulation/logging/Replay";
import { baselineIdentity, configurationIdentity } from "../simulation/logging/Identity";
import { scenarioProgress } from "../game/ScenarioProgress";
import { useGameStore } from "../game/GameStore";
import { ScenarioStatus } from "../components/ScenarioStatus";
import { DecisionHistory } from "../components/DecisionHistory";
import { RunFiles } from "../components/RunFiles";
import { RoadInspector } from "../components/RoadInspector";
import { EndScreen } from "../components/EndScreen";
import type { Scenario, SimulationAction } from "../simulation/types";
import { calculateBaseline } from "../workers/baselineWorker";

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  message: any;
  terminated = false;
  constructor(readonly url: URL) { ControlledWorker.instances.push(this); }
  postMessage(message: any) { this.message = message; }
  terminate() { this.terminated = true; }
  reply(data: unknown) { act(() => this.onmessage?.({ data } as MessageEvent)); }
}

const fixture: Scenario = {
  ...mondayMorningScenario, id: "timing_fixture", seed: 7, startTime: 420, endTime: 423,
  graph: {
    nodes: [{ id: "o", x: 0, y: 0, type: "origin" }, { id: "d", x: 1, y: 0, type: "destination" }],
    edges: ["north_bridge", "south_bridge"].map(id => ({ id, name: id === "north_bridge" ? "North Bridge" : "South Bridge", from: "o", to: "d", lengthKm: 20, speedLimitKph: 60, comfortableCapacity: 1, maximumCapacity: 20, major: true }))
  },
  events: [{ id: "incident", time: 0.5, duration: 0.5, type: "CAPACITY_REDUCTION", edgeId: "north_bridge", capacityModifier: 0.6, title: "North Bridge capacity reduced 40%" }],
  demand: { curve: [{ minute: 0, tripsPerMinute: 8 }, { minute: 3, tripsPerMinute: 8 }], pairs: [{ origin: "o", destination: "d", weight: 1 }], passengerTolerance: [5, 5] },
  progression: { rushHourMinute: 0.25 },
  forecast: { ...mondayMorningScenario.forecast!, horizonsMinutes: [0.25, 0.5, 0.75], previewHorizonMinutes: 0.5, refreshIntervalMinutes: 0.25 }
};

function engineFor(scenario = fixture, seed = 7) { const engine = new SimulationEngine(scenario); engine.reset(seed); return engine; }
let fullMondayRun: CompletedRun | null = null;
function fixtureRun() { const engine = engineFor(); while (!engine.isDone()) engine.step(); return createCompletedRun(engine); }
function mount(ui: React.ReactNode) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); act(() => root.render(ui));
  return { host, close: () => { act(() => root.unmount()); host.remove(); } };
}
function click(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === text);
  expect(button).toBeTruthy(); act(() => button!.click());
}
function useFixture() {
  useGameStore.getState().setScenarioMode("monday", 7);
  useGameStore.setState({ engine: engineFor(), scenario: fixture, seed: 7, speed: 0, baseline: { status: "idle", identity: null, metrics: null, error: null, calculationMs: null } });
}
beforeEach(() => { vi.stubGlobal("Worker", ControlledWorker); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); ControlledWorker.instances = []; });
afterEach(() => { useGameStore.getState().setScenarioMode("practice"); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("round progression and event evidence", () => {
  it("uses configured activation/restoration intervals and never equates capacity restoration with cleared traffic", () => {
    useFixture();
    const { host, close } = mount(<ScenarioStatus />);
    expect(host.textContent).toContain("Morning commute building");
    act(() => useGameStore.getState().step());
    expect(host.textContent).toContain("Rush hour");
    act(() => useGameStore.getState().step());
    expect(useGameStore.getState().engine.getState().graph.edge("north_bridge").capacityModifier).toBe(1);
    act(() => useGameStore.getState().step());
    expect(host.textContent).toContain("Bridge incident");
    expect(host.textContent).toContain("40%");
    expect(host.textContent).toContain("0.25 min scheduled remaining");
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    click(host, "Dismiss incident notice");
    act(() => useGameStore.getState().step());
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(useGameStore.getState().engine.getState().graph.edge("north_bridge").capacityModifier).toBe(0.6);
    act(() => useGameStore.getState().step());
    expect(host.textContent).toContain("Recovery");
    expect(host.textContent).toContain("Capacity restored");
    expect(host.textContent).toContain("Traffic may still be congested");
    expect(host.textContent).not.toMatch(/traffic has cleared|network recovered/i);
    expect(useGameStore.getState().engine.getState().metrics.activeTrips).toBeGreaterThan(0);
    act(() => { while (!useGameStore.getState().engine.isDone()) useGameStore.getState().step(); });
    expect(host.textContent).toContain("Scenario complete"); close();
  });

  it("stage and incident evidence agree across pause and 1/2/4 tick groupings", () => {
    const snapshots = (group: number) => {
      const engine = engineFor(); const output: unknown[] = [];
      while (!engine.isDone()) for (let i = 0; i < group && !engine.isDone(); i++) {
        engine.step(); output.push(scenarioProgress(fixture, engine.getObservation(), engine.getInfo().activeEventIds));
      }
      return output;
    };
    expect(snapshots(1)).toEqual(snapshots(2)); expect(snapshots(1)).toEqual(snapshots(4));
    const event = mondayMorningScenario.events[0];
    expect(mondayMorningScenario.startTime + event.time).toBe(8 * 60 + 12);
    expect(mondayMorningScenario.startTime + event.time + event.duration).toBe(8 * 60 + 27);
    expect(event.capacityModifier).toBe(0.6);
  });
});

describe("objective breakdown and compatible asynchronous baseline", () => {
  it("all weighted components sum to total, with copy-safe observations and snapshots", () => {
    const engine = engineFor(); while (!engine.isDone()) engine.step();
    const metrics = engine.getState().metrics;
    expect(Object.values(metrics.objectiveBreakdown!).reduce((a, b) => a + b, 0)).toBe(metrics.objective);
    metrics.objectiveBreakdown!.travelTime = -999;
    expect(engine.getObservation().metrics.objectiveBreakdown!.travelTime).toBeGreaterThan(0);
  });
  it("computes off-thread, matches the selected seed/configuration, and ignores obsolete worker results", () => {
    useGameStore.getState().setScenarioMode("monday", 301);
    const first = ControlledWorker.instances.at(-1)!;
    expect(first.message.seed).toBe(301); expect(first.message.kind).toBe("baseline");
    const spy = vi.spyOn(SimulationEngine.prototype, "step");
    useGameStore.getState().computeBaseline(); expect(spy).not.toHaveBeenCalled();
    useGameStore.getState().setScenarioMode("monday", 302);
    const second = ControlledWorker.instances.at(-1)!;
    expect(first.terminated).toBe(true);
    first.reply({ identity: baselineIdentity(mondayMorningScenario, 301), metrics: fixtureRun().finalMetrics, calculationMs: 1 });
    expect(useGameStore.getState().baseline.status).toBe("loading");
    second.reply({ identity: "wrong-config", metrics: fixtureRun().finalMetrics, calculationMs: 1 });
    expect(useGameStore.getState().baseline.status).toBe("error");
    expect(useGameStore.getState().baselineObjective).toBeNull();
    useGameStore.getState().computeBaseline();
    const worker = ControlledWorker.instances.at(-1)!;
    const response = calculateBaseline({ kind: "baseline", scenario: fixture, seed: 302 });
    // A fixture result cannot masquerade as the selected challenge.
    worker.reply(response);
    expect(useGameStore.getState().baseline.status).toBe("error");
    expect(configurationIdentity(fixture)).not.toBe(configurationIdentity({ ...fixture, objectiveWeights: { ...fixture.objectiveWeights, congestion: 1 } }));
  });
});

describe("run format validation and deterministic replay", () => {
  it("round trips a complete supported run and reproduces all state, not just total cost", () => {
    const engine = engineFor(); engine.step({ type: "DEBUG_SPAWN", count: 3 });
    engine.step({ type: "DELAY_DEPARTURES", durationMinutes: 0.5, percentage: 1 });
    while (!engine.isDone()) engine.step();
    const run = parseRunFile(JSON.stringify(createCompletedRun(engine)), fixture);
    const replay = engineFor();
    while (!replay.isDone()) replay.step(actionForReplayTick(run, replay.getState().time + replay.dtMinutes));
    expect(verifyCompletedRun(replay, run)).toBeNull();
    expect(replay.createRun()).toEqual(engine.createRun());
    const changedLog = structuredClone(run); changedLog.actions[0].affectedCount++;
    expect(verifyCompletedRun(replay, changedLog)).toContain("recorded action log differs");
    changedLog.actions[0].affectedCount--; changedLog.actions[0].immediateReward++;
    expect(verifyCompletedRun(replay, changedLog)).toContain("recorded action log differs");
    expect(replayRun(fixture, run).finalMetrics).toEqual(run.finalMetrics);
    const tampered = structuredClone(run); tampered.finalMetrics.averageTravelTime += 1;
    expect(verifyCompletedRun(replay, tampered)).toContain("final metrics differ");
    tampered.finalMetrics = run.finalMetrics; tampered.finalStateChecksum = "0000000000000000";
    expect(verifyCompletedRun(replay, tampered)).toContain("simulation state differs");
    expect(() => replayRun(fixture, tampered)).toThrow("simulation state differs");
    expect(() => replayRun(fixture, { ...run, engineVersion: "0.1.0" })).toThrow("Incompatible engine");
  });

  it("rejects malformed, older, incompatible, mistimed, duplicate, and invalid-parameter runs", () => {
    const run = fixtureRun();
    expect(() => parseRunFile("{", fixture)).toThrow("Invalid JSON");
    expect(() => parseRunFile("null", fixture)).toThrow("object");
    const bad = (mutate: (run: any) => void, message: RegExp) => { const copy = structuredClone(run); mutate(copy); expect(() => parseRunFile(JSON.stringify(copy), fixture)).toThrow(message); };
    bad(run => delete run.schemaVersion, /schema/);
    bad(run => run.engineVersion = "0.1.0", /engine version/);
    bad(run => run.scenarioVersion++, /scenario/);
    bad(run => run.configurationIdentity = "other", /configuration/);
    bad(run => run.seed = 0, /Seed/);
    bad(run => run.finalMetrics.tripsCompleted++, /trip counts/);
    bad(run => run.finalMetrics.averageTravelTime = -1, /Invalid final metric/);
    bad(run => run.finalMetrics.averageSatisfaction = 101, /between 0 and 100/);
    bad(run => run.finalMetrics.objectiveBreakdown.travelTime++, /sum/);
    const entry = { simulationTime: 0.25, stateSnapshotId: "t_0.25", action: { type: "REROUTE", targetEdge: "north_bridge", percentage: 0.25 }, immediateReward: 0, affectedCount: 0 };
    bad(run => run.actions = [{ ...entry, action: { type: "HACK" } }], /Unsupported action/);
    bad(run => run.actions = [{ ...entry, action: { ...entry.action, percentage: 2 } }], /percentage/);
    bad(run => run.actions = [{ ...entry, action: { ...entry.action, targetEdge: "missing" } }], /Unknown/);
    bad(run => run.actions = [{ ...entry, action: { type: "DELAY_DEPARTURES", durationMinutes: -1, percentage: 1 } }], /duration/);
    bad(run => run.actions = [{ ...entry, simulationTime: 0.3, stateSnapshotId: "t_0.30" }], /tick/);
    bad(run => run.actions = [entry, entry], /Same-tick/);
    bad(run => run.actions = [{ ...entry, extra: 1 }], /Unsupported/);
    expect(() => parseRunFile("x".repeat(2_000_001), fixture)).toThrow("2 MB");
    expect(() => parseRunFile(JSON.stringify(run), { ...fixture, objectiveWeights: { ...fixture.objectiveWeights, congestion: 1 } })).toThrow("configuration");
  });

  it("full Monday Morning integration replays interventions exactly, guards live actions, and propagates seeds", () => {
    const source = engineFor(mondayMorningScenario, 741);
    for (let tick = 0; !source.isDone(); tick++) {
      source.step(tick === 120 ? { type: "REROUTE", targetEdge: "north_bridge", percentage: 0.25 } : tick === 300 ? { type: "DELAY_DEPARTURES", targetEdge: "north_bridge", percentage: 0.25, durationMinutes: 5 } : { type: "NO_OP" });
      if (tick === 287) expect(source.getState().graph.edge("north_bridge").capacityModifier).toBe(1);
      if (tick === 288) expect(source.getState().graph.edge("north_bridge").capacityModifier).toBe(0.6);
      if (tick === 347) expect(source.getState().graph.edge("north_bridge").capacityModifier).toBe(0.6);
      if (tick === 348) expect(source.getState().graph.edge("north_bridge").capacityModifier).toBe(1);
    }
    const run = parseRunFile(JSON.stringify(createCompletedRun(source)), mondayMorningScenario);
    fullMondayRun = run;
    useGameStore.getState().startReplay(run);
    expect(useGameStore.getState().speed).toBe(0);
    expect(useGameStore.getState().seed).toBe(741);
    const { host, close } = mount(<RoadInspector />);
    expect([...host.querySelectorAll('.actionChoice button')].every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    const workers = ControlledWorker.instances.length;
    useGameStore.getState().requestPreview({ type: "DEBUG_SPAWN", count: 100 });
    expect(ControlledWorker.instances).toHaveLength(workers);
    act(() => {
      while (!useGameStore.getState().engine.isDone()) {
        const before = useGameStore.getState().engine.getState().time;
        useGameStore.getState().setSpeed(0); expect(useGameStore.getState().engine.getState().time).toBe(before);
        useGameStore.getState().setSpeed(4);
        for (let i = 0; i < 4; i++) useGameStore.getState().step({ type: "DEBUG_SPAWN", count: 99 });
      }
    });
    expect(useGameStore.getState().replay?.verification).toBe("verified");
    expect(useGameStore.getState().engine.createRun().actions).toEqual(run.actions);
    expect(useGameStore.getState().engine.getState().metrics).toEqual(source.getState().metrics);
    act(() => useGameStore.getState().reset());
    expect(useGameStore.getState().replay?.verification).toBe("pending");
    expect(useGameStore.getState().decisionHistory).toHaveLength(0);
    expect(useGameStore.getState().engine.getState().time).toBe(0);
    close();
  }, 20000);
});

describe("session, history, and file UI", () => {
  it("history excludes Cancel, records actual applied count once, and labels immediate cost honestly", () => {
    useGameStore.getState().startFreePractice();
    const { host, close } = mount(<><RoadInspector /><DecisionHistory /></>);
    click(host, "Preview Reroute");
    let worker = ControlledWorker.instances.at(-1)!;
    const engine = new SimulationEngine(worker.message.snapshot.scenario); engine.restoreFromSnapshot(worker.message.snapshot);
    const result = engine.previewAction(worker.message.action);
    worker.reply({ requestId: worker.message.requestId, sessionId: worker.message.sessionId, result, timings: { calculationMs: 1 } });
    click(host, "Cancel");
    expect(useGameStore.getState().decisionHistory).toHaveLength(0);
    click(host, "Preview Reroute"); click(host, "Apply");
    expect(useGameStore.getState().decisionHistory).toHaveLength(1);
    expect(useGameStore.getState().decisionHistory[0].affectedCount).toBe(result.affectedVehicles);
    expect(host.textContent).toContain("immediate tick system-cost change");
    expect(host.textContent).toContain("does not establish long-term action impact");
    act(() => useGameStore.getState().reset());
    expect(useGameStore.getState().decisionHistory).toHaveLength(0); expect(useGameStore.getState().incidentNotice).toBeNull(); close();
  });

  it("same-seed retry reproduces demand/baseline and new seed resets every session surface", () => {
    useGameStore.getState().setScenarioMode("monday", 12345);
    const request = ControlledWorker.instances.at(-1)!.message;
    const response = calculateBaseline(request);
    ControlledWorker.instances.at(-1)!.reply(response);
    for (let tick = 0; tick < 20; tick++) useGameStore.getState().step();
    const firstDemand = useGameStore.getState().engine.exportSnapshot().vehicles;
    const firstBaseline = useGameStore.getState().baseline.metrics;
    useGameStore.getState().retrySameSeed();
    expect(useGameStore.getState().seed).toBe(12345);
    expect(useGameStore.getState().baseline.metrics).toEqual(firstBaseline);
    for (let tick = 0; tick < 20; tick++) useGameStore.getState().step();
    expect(useGameStore.getState().engine.exportSnapshot().vehicles).toEqual(firstDemand);
    useGameStore.getState().requestPreview({ type: "REROUTE", targetEdge: "north_bridge", percentage: 0.25 });
    const pending = ControlledWorker.instances.at(-1)!;
    useGameStore.setState({ incidentNotice: "old incident", importError: "old error" });
    useGameStore.getState().newSeed();
    const store = useGameStore.getState();
    expect(store.seed).not.toBe(12345);
    expect(store.scenario.seed).toBe(store.seed);
    expect(store.engine.createRun().seed).toBe(store.seed);
    expect(ControlledWorker.instances.at(-1)!.message.seed).toBe(store.seed);
    expect(store.baseline.identity).toBe(baselineIdentity(store.scenario, store.seed));
    expect(pending.terminated).toBe(true); expect(store.preview.status).toBe("idle");
    expect(store.decisionHistory).toHaveLength(0); expect(store.incidentNotice).toBeNull(); expect(store.importError).toBeNull();
  }, 15000);

  it("import only stages a validated run until explicit Start, and failed imports leave the live run intact", () => {
    useGameStore.getState().setScenarioMode("monday");
    const engine = useGameStore.getState().engine;
    const { host, close } = mount(<RunFiles />);
    act(() => useGameStore.getState().importRun("invalid"));
    expect(host.textContent).toContain("Invalid JSON"); expect(useGameStore.getState().engine).toBe(engine);
    // Correct scenario metadata is required even for an otherwise valid completed fixture.
    act(() => useGameStore.getState().importRun(JSON.stringify(fixtureRun())));
    expect(host.textContent).toContain("Incompatible scenario"); expect(useGameStore.getState().engine).toBe(engine);
    expect(useGameStore.getState().replay).toBeNull(); close();
  });

  it("file input stages a supported run, Keep preserves the session, and Start explicitly enters replay", async () => {
    expect(fullMondayRun).not.toBeNull();
    useGameStore.getState().setScenarioMode("monday");
    const previous = useGameStore.getState().engine;
    const { host, close } = mount(<RunFiles />);
    const input = host.querySelector("input")!;
    const file = new File([JSON.stringify(fullMondayRun)], "run.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => JSON.stringify(fullMondayRun) });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.textContent).toContain("Compatible run"); expect(useGameStore.getState().engine).toBe(previous);
    click(host, "Keep Current Run"); expect(useGameStore.getState().pendingImport).toBeNull();
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    click(host, "Start Imported Replay");
    expect(useGameStore.getState().replay?.run).toEqual(fullMondayRun);
    expect(useGameStore.getState().engine.getState().time).toBe(0);
    expect(useGameStore.getState().seed).toBe(fullMondayRun!.seed);
    close();
  });

  it("export creates a local JSON download of the complete supported format", async () => {
    useGameStore.getState().setScenarioMode("monday");
    useGameStore.setState({ completedRun: fullMondayRun });
    let exported: Blob | null = null;
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL(blob: Blob) { exported = blob; return "blob:local-run"; }
      static revokeObjectURL() {}
    });
    const anchor = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { host, close } = mount(<RunFiles />);
    click(host, "Export Completed Run JSON");
    expect(anchor).toHaveBeenCalledOnce();
    expect(exported!.type).toBe("application/json");
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsText(exported!);
    });
    expect(parseRunFile(text, mondayMorningScenario)).toEqual(fullMondayRun);
    close();
  });

  it("practice results stay separate and incompatible baselines are never shown", () => {
    useGameStore.getState().startFreePractice();
    const { host, close } = mount(<EndScreen />);
    expect(host.textContent).toContain(practiceScenario.name);
    expect(host.textContent).not.toContain("Improvement"); expect(host.textContent).not.toContain("Export Completed");
    click(host, "Start Monday Morning");
    act(() => useGameStore.setState({ baseline: { status: "ready", identity: "wrong", metrics: fixtureRun().finalMetrics, error: null, calculationMs: 1 } }));
    expect(host.textContent).toContain("No compatible baseline");
    expect(host.textContent).toContain("No-action baseline costUnavailable");
    close();
  });
});
