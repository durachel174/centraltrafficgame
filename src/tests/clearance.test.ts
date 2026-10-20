import { describe, expect, it, vi } from "vitest";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { clearanceDiagnostic } from "../simulation/diagnostics/Clearance";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import { createCompletedRun, parseRunFile, verifyCompletedRun } from "../simulation/logging/RunFile";
import type { Scenario } from "../simulation/types";

const fixture = (overrides: Partial<Scenario> = {}): Scenario => ({
  ...mondayMorningScenario, id: "storage_fixture", startTime: 0, endTime: 20, events: [],
  congestion: { alpha: 0, beta: 4, utilizationThreshold: .82 },
  graph: { nodes: ["a", "b", "c"].map((id, x) => ({ id, x, y: 0, type: "intersection" as const })),
    edges: [ ["ab", "a", "b"], ["bc", "b", "c"] ].map(([id, from, to]) => ({ id, from, to, lengthKm: .25, speedLimitKph: 60, comfortableCapacity: 1, maximumCapacity: 1, major: true })) },
  demand: { curve: [{ minute: 0, tripsPerMinute: 0 }], pairs: [{ origin: "a", destination: "c", weight: 1 }], passengerTolerance: [10, 10] },
  ...overrides
});
const setup = (scenario = fixture(), count = 1) => {
  const e = new SimulationEngine(scenario, undefined, true); e.reset(7);
  const s = e.exportSnapshot(); s.waiting = Array.from({ length: count }, (_, i) => ({ id: `trip_${i}`, origin: "a", destination: "c", requestedDepartureTime: 0, passengerTolerance: 10 }));
  e.restoreFromSnapshot(s); return e;
};
const conserve = (e: SimulationEngine, n: number) => {
  const s = e.getState(), m = s.metrics;
  expect(m.waitingTrips + m.activeTrips + m.tripsCompleted).toBe(n);
  expect(new Set([...s.waiting, ...s.vehicles].map(v => v.id)).size).toBe(n);
  for (const edge of e.graph.edges.values()) {
    expect(edge.currentVehicleCount).toBe(s.vehicles.filter(v => v.status === "traveling" && v.route[v.currentEdgeIndex] === edge.id).length);
    expect(edge.currentVehicleCount).toBeLessThanOrEqual(edge.maximumCapacity);
  }
};

describe("physical road storage and passenger conservation", () => {
  it("uses kilometres, km/h and minutes exactly across multiple edges in one tick", () => {
    const scenario = fixture(); scenario.graph.edges.forEach(e => e.lengthKm = .125);
    const e = setup(scenario); e.step();
    const v = e.getState().vehicles[0];
    expect(v.status).toBe("arrived"); expect(v.actualDepartureTime).toBe(0); expect(v.actualArrivalTime).toBe(.25);
    expect(v.distanceKm).toBe(.25); expect(e.getState().metrics.objectiveBreakdown!.travelTime).toBe(.25); conserve(e, 1);
  });
  it("queues overload at origins, admits only available storage, and clears a finite pipeline", () => {
    const e = setup(fixture(), 10);
    // One .25-minute edge slot per tick: 10 trips + one downstream edge = 11 ticks.
    for (let tick = 1; tick <= 11; tick++) { e.step(); conserve(e, 10); }
    expect(e.getState().metrics.tripsCompleted).toBe(10);
    expect(e.getState().metrics.departureDelay).toBeCloseTo(45 * .25);
    expect(e.getState().vehicles.every(v => v.distanceKm === .5)).toBe(true);
  });
  it("retains downstream-blocked vehicles on their current road, with no duplicated distance or origin charge", () => {
    const e = setup(); e.graph.edge("bc").closed = true;
    // Route unavailable at origin is retained, not discarded.
    e.step(); expect(e.getState().waiting).toHaveLength(1); expect(e.getState().metrics.departureDelay).toBe(.25);
    e.graph.edge("bc").closed = false; e.step();
    // Vehicle is now on bc. Closing an occupied road must preserve it even at progress zero.
    e.graph.edge("bc").closed = true; e.step(); conserve(e, 1);
    expect(e.getState().vehicles[0].distanceKm).toBe(.25);
    e.graph.edge("bc").closed = false; e.step();
    expect(e.getState().vehicles[0].actualArrivalTime).toBe(1); conserve(e, 1);
  });
  it("accounts in-network queues separately and charges elapsed travel once", () => {
    const scenario = fixture(); scenario.graph.edges[1].lengthKm = 1;
    const e = setup(scenario, 2); e.step(); e.step();
    expect(e.getState().metrics.inNetworkQueuedTrips).toBe(1);
    const queued = e.getState().vehicles.find(v => v.edgeProgress === 1)!;
    expect(queued.route[queued.currentEdgeIndex]).toBe("ab"); expect(queued.distanceKm).toBe(.25);
    const before = e.getState().metrics; e.step();
    const after = e.getState().metrics;
    expect(after.departureDelay).toBe(before.departureDelay);
    expect(after.objectiveBreakdown!.travelTime - before.objectiveBreakdown!.travelTime).toBe(.5);
    expect(e.getState().vehicles.find(v => v.id === queued.id)!.distanceKm).toBe(.25); conserve(e, 2);
  });
  it("does not reuse an OD route after admission changes occupancy", () => {
    const scenario = fixture({ congestion: { alpha: 1, beta: 4, utilizationThreshold: .82 } });
    scenario.graph.edges = [
      { ...scenario.graph.edges[0], to: "c", lengthKm: 1 },
      { ...scenario.graph.edges[1], from: "a", lengthKm: 1.1 }
    ];
    const e = setup(scenario, 2); e.step();
    expect(e.getState().vehicles.map(v => v.route)).toEqual([["ab"], ["bc"]]); conserve(e, 2);
    const blocked = setup({ ...scenario, graph: { ...scenario.graph, edges: [] } }, 100);
    const routing = vi.spyOn(blocked.router, "findRoute"); blocked.step();
    expect(routing).toHaveBeenCalledTimes(1); conserve(blocked, 100);
  });
  it("reports a full storage cycle as unresolved instead of forcing passage", () => {
    const scenario = fixture({ endTime: .25 });
    scenario.graph.edges.push({ ...scenario.graph.edges[0], id: "ca", from: "c", to: "a" });
    const e = setup(scenario, 0), snap = e.exportSnapshot();
    snap.vehicles = [ ["a", "c", "ab", "bc"], ["b", "a", "bc", "ca"], ["c", "b", "ca", "ab"] ].map(([origin, destination, first, second], i) => ({
      id: `cycle_${i}`, origin, destination, route: [first, second], currentEdgeIndex: 0, edgeProgress: 1, requestedDepartureTime: 0,
      actualDepartureTime: 0, baselineTravelTime: .5, baselineDistanceKm: .5, status: "traveling", passengerTolerance: 10,
      satisfaction: 100, rerouteCount: 0, distanceKm: .25
    }));
    snap.graph.edges.forEach(edge => edge.currentVehicleCount = 1); e.restoreFromSnapshot(snap); e.step();
    const d = clearanceDiagnostic(e, 1); while (!d.isDone()) d.step(); conserve(d, 3);
    expect(d.getState().metrics.inNetworkQueuedTrips).toBe(3); expect(d.getState().metrics.tripsCompleted).toBe(0);
    expect(d.getState().vehicles.every(v => v.edgeProgress === 1 && v.distanceKm === .25)).toBe(true);
  });
  it("retains a genuinely unreachable trip until a censored limit", () => {
    const scenario = fixture({ endTime: .25 }); scenario.graph.edges = [];
    const e = setup(scenario); e.step(); const d = clearanceDiagnostic(e, 1);
    while (!d.isDone()) d.step(); conserve(d, 1);
    expect(d.getState().metrics.waitingTrips).toBe(1); expect(d.getState().metrics.departureDelay).toBe(1.25);
  });
  it("overloaded BPR movement remains emergent and eventually drains without clamping travel times", () => {
    const scenario = fixture({ endTime: 100, congestion: { alpha: .15, beta: 4, utilizationThreshold: .82 } });
    scenario.graph.edges = [{ ...scenario.graph.edges[0], to: "c", lengthKm: 1, comfortableCapacity: 10, maximumCapacity: 20 }];
    const e = setup(scenario, 100); e.step();
    expect(e.graph.edge("ab").currentTravelTime).toBeCloseTo(3.4);
    expect(e.getState().metrics.waitingTrips).toBe(80);
    while (e.getObservation().activeTrips + e.getObservation().waitingTrips && !e.isDone()) { e.step(); conserve(e, 100); }
    expect(e.getState().metrics.tripsCompleted).toBe(100);
    expect(e.getState().vehicles.every(v => v.distanceKm >= 1 - 1e-10 && v.actualArrivalTime! >= v.actualDepartureTime! + 1)).toBe(true);
  });
});

describe("separate clearance experiment and version compatibility", () => {
  it("preserves held trips, restrictions, events and accrued costs; no new demand/actions or terminal double count", () => {
    const scenario = fixture({ endTime: .5, events: [{ id: "restriction", title: "Test restriction", type: "CAPACITY_REDUCTION", time: 0, duration: 1, edgeId: "ab", capacityModifier: .5 }] });
    const e = setup(scenario); e.step({ type: "DELAY_DEPARTURES", percentage: 1, durationMinutes: 2 }); e.step();
    const source = e.exportSnapshot(), d = clearanceDiagnostic(e, 4);
    expect(d.exportSnapshot().waiting).toEqual(source.waiting); expect(d.exportSnapshot().activeEventIds).toEqual(source.activeEventIds);
    expect(d.getState().metrics.departureDelay).toBe(.5);
    while (d.getObservation().activeTrips + d.getObservation().waitingTrips && !d.isDone()) d.step();
    expect(d.getState().metrics.tripsRequested).toBe(1); expect(d.getState().metrics.tripsCompleted).toBe(1);
    expect(d.getState().metrics.departureDelay).toBe(2);
    expect(d.getState().metrics.objectiveBreakdown!.terminalHoldDelay).toBe(0);
    expect(d.graph.edge("ab").capacityModifier).toBe(1); expect(d.createRun().actions).toEqual(e.createRun().actions);
    expect(e.exportSnapshot()).toEqual(source); e.step({ type: "DEBUG_SPAWN", count: 2 }); expect(e.exportSnapshot()).toEqual(source);
  });
  it("forecast and preview reproduce authoritative admissions and queueing", () => {
    const e = setup(fixture(), 8), original = e.exportSnapshot();
    const preview = e.previewAction({ type: "DELAY_DEPARTURES", percentage: 1, durationMinutes: 2 });
    const noAction = new SimulationEngine(original.scenario, undefined, true), action = new SimulationEngine(original.scenario, undefined, true);
    noAction.restoreFromSnapshot(original); action.restoreFromSnapshot(original);
    action.step({ type: "DELAY_DEPARTURES", percentage: 1, durationMinutes: 2 }); noAction.step();
    while (action.getState().time < preview.horizonMinutes) { action.step(); noAction.step(); }
    expect(preview.networkCostDelta).toBe(action.getState().metrics.objective - noAction.getState().metrics.objective);
    expect(e.exportSnapshot()).toEqual(original);
    const forecast = e.calculateForecasts();
    const road = forecast.find(f => f.edgeId === "ab")!;
    expect(road.samples[0].utilization).toBe(0); // all 8 finite-pipeline trips finish before +5m
  });
  it("verifies new-version exported runs and rejects old exports and snapshots explicitly", () => {
    const scenario = fixture({ endTime: 2 }), e = new SimulationEngine(scenario, undefined, true); e.reset(7);
    e.step({ type: "DEBUG_SPAWN", count: 3 }); while (!e.isDone()) e.step();
    const run = createCompletedRun(e), file = parseRunFile(JSON.stringify(run), scenario);
    expect(verifyCompletedRun(e, file)).toBeNull();
    const replay = new SimulationEngine(scenario, undefined, true); replay.reset(file.seed);
    replay.step(file.actions[0].action); while (!replay.isDone()) replay.step();
    expect(verifyCompletedRun(replay, file)).toBeNull();
    expect(() => parseRunFile(JSON.stringify({ ...run, engineVersion: "0.3.0" }), scenario)).toThrow(/Incompatible engine/);
    expect(() => e.restoreFromSnapshot({ ...e.exportSnapshot(), version: 1 } as any)).toThrow(/Incompatible simulation snapshot/);
    expect(() => e.restoreFromSnapshot({ ...e.exportSnapshot(), engineVersion: "0.3.0" })).toThrow(/Incompatible simulation snapshot/);
    expect(() => parseRunFile(JSON.stringify({ ...run, finalMetrics: { ...run.finalMetrics, inNetworkQueuedTrips: run.finalMetrics.activeTrips + 1 } }), scenario)).toThrow(/Inconsistent final trip counts/);
  });
});
