import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { SeededRandom } from "../simulation/core/SeededRandom";
import { TrafficGraph } from "../simulation/network/TrafficGraph";
import { Router } from "../simulation/network/Router";
import { travelTime } from "../simulation/traffic/CongestionModel";
import { replayRun } from "../simulation/logging/Replay";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import type { GraphConfig, RoadEdge } from "../simulation/network/types";
import type { Scenario } from "../simulation/types";

const congestion = { alpha: 0.15, beta: 4, utilizationThreshold: 0.82 };

function run(seed = 428193, actions: Record<number, Parameters<SimulationEngine["step"]>[0]> = {}) {
  const engine = new SimulationEngine(mondayMorningScenario);
  engine.reset(seed);
  for (let i = 0; i < 160; i++) engine.step(actions[i] ?? { type: "NO_OP" });
  return engine.getState().metrics;
}

describe("determinism", () => {
  it("produces identical metrics for same seed and actions", () => {
    const actions = { 30: { type: "DEBUG_SPAWN" as const, count: 100 }, 60: { type: "REROUTE" as const, targetEdge: "north_bridge", percentage: 0.25 } };
    expect(run(123, actions)).toEqual(run(123, actions));
  });

  it("seeded RNG is deterministic", () => {
    const a = new SeededRandom(9);
    const b = new SeededRandom(9);
    expect([a.next(), a.next(), a.int(10)]).toEqual([b.next(), b.next(), b.int(10)]);
  });
});

describe("routing", () => {
  const graphConfig: GraphConfig = {
    nodes: [
      { id: "a", x: 0, y: 0, type: "origin" },
      { id: "b", x: 1, y: 0, type: "intersection" },
      { id: "c", x: 2, y: 0, type: "destination" }
    ],
    edges: [
      { id: "fast1", from: "a", to: "b", lengthKm: 1, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20 },
      { id: "fast2", from: "b", to: "c", lengthKm: 1, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20 },
      { id: "slow", from: "a", to: "c", lengthKm: 4, speedLimitKph: 40, comfortableCapacity: 10, maximumCapacity: 20 }
    ]
  };

  it("selects the fastest route by travel time", () => {
    const router = new Router(new TrafficGraph(graphConfig), congestion);
    expect(router.findRoute("a", "c")).toEqual(["fast1", "fast2"]);
  });

  it("switches to South Bridge when North Bridge is congested", () => {
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(1);
    const graph = engine.getState().graph;
    graph.edge("north_bridge").currentVehicleCount = 350;
    graph.edge("north_bridge").currentTravelTime = travelTime(graph.edge("north_bridge"), congestion);
    const route = new Router(graph, congestion).findRoute("north_res", "airport");
    expect(route).toContain("south_bridge");
  });
});

describe("traffic math and actions", () => {
  it("increasing utilization increases travel time", () => {
    const edge = {
      id: "e",
      from: "a",
      to: "b",
      lengthKm: 1,
      speedLimitKph: 60,
      comfortableCapacity: 10,
      maximumCapacity: 20,
      baseTravelTime: 1,
      currentTravelTime: 1,
      capacityModifier: 1,
      closed: false,
      currentVehicleCount: 2
    } satisfies RoadEdge;
    const low = travelTime(edge, congestion);
    edge.currentVehicleCount = 14;
    expect(travelTime(edge, congestion)).toBeGreaterThan(low);
  });

  it("capacity reduction increases expected travel time", () => {
    const edge = {
      id: "e",
      from: "a",
      to: "b",
      lengthKm: 1,
      speedLimitKph: 60,
      comfortableCapacity: 10,
      maximumCapacity: 20,
      baseTravelTime: 1,
      currentTravelTime: 1,
      capacityModifier: 1,
      closed: false,
      currentVehicleCount: 8
    } satisfies RoadEdge;
    const normal = travelTime(edge, congestion);
    edge.capacityModifier = 0.5;
    expect(travelTime(edge, congestion)).toBeGreaterThan(normal);
  });

  it("departure delay holds trips before release", () => {
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(2);
    engine.step({ type: "DEBUG_SPAWN", count: 100 });
    engine.step({ type: "DELAY_DEPARTURES", destination: "downtown", durationMinutes: 5, percentage: 1 });
    const waitingAfterHold = engine.getState().metrics.waitingTrips;
    expect(waitingAfterHold).toBeGreaterThan(0);
    engine.step({ type: "RELEASE_DEPARTURES", destination: "downtown" });
    expect(engine.getState().metrics.waitingTrips).toBeLessThan(waitingAfterHold);
  });

  it("reroute action changes eligible routes", () => {
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(3);
    engine.step({ type: "DEBUG_SPAWN", count: 400 });
    for (let i = 0; i < 5; i++) engine.step({ type: "NO_OP" });
    const before = engine.getState().vehicles.filter((vehicle) => vehicle.route.includes("north_bridge")).length;
    engine.step({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 1 });
    const after = engine.getState().vehicles.filter((vehicle) => vehicle.route.slice(vehicle.currentEdgeIndex + 1).includes("north_bridge")).length;
    expect(after).toBeLessThan(before);
  });

  it("large reroutes can increase South Bridge load", () => {
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(4);
    engine.step({ type: "DEBUG_SPAWN", count: 600 });
    for (let i = 0; i < 6; i++) engine.step({ type: "NO_OP" });
    const before = engine.getState().graph.edge("south_bridge").currentVehicleCount;
    engine.step({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 1 });
    for (let i = 0; i < 18; i++) engine.step({ type: "NO_OP" });
    expect(engine.getState().graph.edge("south_bridge").currentVehicleCount).toBeGreaterThanOrEqual(before);
  });
});

describe("forecast, replay, speed independence", () => {
  it("known future demand produces overload forecast", () => {
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(5);
    for (let i = 0; i < 220; i++) engine.step({ type: "NO_OP" });
    expect(engine.getState().alerts.some((alert) => alert.edgeId === "north_bridge")).toBe(true);
  });

  it("replaying action log produces the same final objective", () => {
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(6);
    for (let i = 0; i < 60; i++) engine.step(i === 20 ? { type: "DEBUG_SPAWN", count: 100 } : { type: "NO_OP" });
    while (!engine.isDone()) engine.step({ type: "NO_OP" });
    const replay = replayRun(mondayMorningScenario, engine.createRun());
    expect(replay.finalMetrics?.objective).toBe(engine.createRun().finalMetrics?.objective);
  });

  it("UI speed grouping does not change simulation results", () => {
    const one = new SimulationEngine(mondayMorningScenario);
    const four = new SimulationEngine(mondayMorningScenario);
    one.reset(7);
    four.reset(7);
    for (let i = 0; i < 80; i++) one.step({ type: "NO_OP" });
    for (let group = 0; group < 20; group++) {
      for (let i = 0; i < 4; i++) four.step({ type: "NO_OP" });
    }
    expect(four.getState().metrics).toEqual(one.getState().metrics);
  });
});
