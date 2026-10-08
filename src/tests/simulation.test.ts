import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { SeededRandom } from "../simulation/core/SeededRandom";
import { TrafficGraph } from "../simulation/network/TrafficGraph";
import { Router } from "../simulation/network/Router";
import { travelTime } from "../simulation/traffic/CongestionModel";
import { calculateMetrics } from "../simulation/scoring/Metrics";
import { replayRun } from "../simulation/logging/Replay";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import type { GraphConfig, RoadEdge } from "../simulation/network/types";
import type { Scenario } from "../simulation/types";

const congestion = { alpha: 0.15, beta: 4, utilizationThreshold: 0.82 };
const baseWeights = { travelTime: 1, congestion: 10, departureDelay: 2, dissatisfaction: 1, excessDistance: 1 };

function fixtureScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "fixture",
    name: "Fixture",
    seed: 10,
    startTime: 0,
    endTime: 30,
    graph: {
      nodes: [
        { id: "o", x: 0, y: 0, type: "origin" },
        { id: "a", x: 1, y: 0, type: "intersection" },
        { id: "d", x: 2, y: 0, type: "destination" }
      ],
      edges: [
        { id: "slow", from: "o", to: "d", lengthKm: 30, speedLimitKph: 30, comfortableCapacity: 10, maximumCapacity: 20, major: true },
        { id: "short", from: "o", to: "a", lengthKm: 1, speedLimitKph: 30, comfortableCapacity: 10, maximumCapacity: 20 },
        { id: "short2", from: "a", to: "d", lengthKm: 1, speedLimitKph: 30, comfortableCapacity: 10, maximumCapacity: 20 }
      ]
    },
    demand: {
      curve: [
        { minute: 0, tripsPerMinute: 0 },
        { minute: 30, tripsPerMinute: 0 }
      ],
      pairs: [{ origin: "o", destination: "d", weight: 1 }],
      passengerTolerance: [5, 5]
    },
    events: [],
    objectiveWeights: baseWeights,
    congestion: { ...congestion, utilizationThreshold: 0.8 },
    satisfaction: { departureDelay: 1, lateDelay: 1, reroute: 1 },
    forecast: {
      horizonsMinutes: [5, 10, 15],
      refreshIntervalMinutes: 1,
      warningUtilization: 0.9,
      criticalUtilization: 1.2,
      previewHorizonMinutes: 5
    },
    ...overrides
  };
}

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

  it("rerouting reduces target-road pressure and increases alternate-road pressure in a controlled fixture", () => {
    const scenario = fixtureScenario({
      graph: {
        nodes: [
          { id: "o", x: 0, y: 0, type: "origin" },
          { id: "split", x: 1, y: 0, type: "intersection" },
          { id: "n", x: 2, y: -1, type: "intersection" },
          { id: "s", x: 2, y: 1, type: "intersection" },
          { id: "d", x: 3, y: 0, type: "destination" }
        ],
        edges: [
          { id: "approach", from: "o", to: "split", lengthKm: 10, speedLimitKph: 60, comfortableCapacity: 100, maximumCapacity: 150 },
          { id: "north_bridge", from: "split", to: "n", lengthKm: 10, speedLimitKph: 60, comfortableCapacity: 100, maximumCapacity: 150, major: true },
          { id: "north_exit", from: "n", to: "d", lengthKm: 1, speedLimitKph: 60, comfortableCapacity: 100, maximumCapacity: 150 },
          { id: "south_bridge", from: "split", to: "s", lengthKm: 11, speedLimitKph: 60, comfortableCapacity: 100, maximumCapacity: 150, major: true },
          { id: "south_exit", from: "s", to: "d", lengthKm: 1, speedLimitKph: 60, comfortableCapacity: 100, maximumCapacity: 150 }
        ]
      }
    });
    const setup = (engine: SimulationEngine) => {
      engine.reset(4);
      engine.step({ type: "DEBUG_SPAWN", count: 20 });
      engine.step({ type: "NO_OP" });
    };
    const noAction = new SimulationEngine(scenario);
    const rerouted = new SimulationEngine(scenario);
    setup(noAction);
    setup(rerouted);
    rerouted.step({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 1 });
    noAction.step({ type: "NO_OP" });
    for (let i = 0; i < 43; i++) {
      rerouted.step({ type: "NO_OP" });
      noAction.step({ type: "NO_OP" });
    }
    expect(rerouted.getState().graph.edge("north_bridge").currentVehicleCount).toBeLessThan(
      noAction.getState().graph.edge("north_bridge").currentVehicleCount
    );
    expect(rerouted.getState().graph.edge("south_bridge").currentVehicleCount).toBeGreaterThan(
      noAction.getState().graph.edge("south_bridge").currentVehicleCount
    );
  });
});

describe("scoring and reward regressions", () => {
  it("active vehicles accumulate travel-time objective cost", () => {
    const engine = new SimulationEngine(fixtureScenario());
    engine.reset(1);
    engine.step({ type: "DEBUG_SPAWN", count: 1 });
    const first = engine.getState().metrics.objective;
    engine.step({ type: "NO_OP" });
    expect(engine.getState().metrics.objective).toBeGreaterThan(first);
  });

  it("holding all trips cannot produce an artificially excellent score", () => {
    const engine = new SimulationEngine(
      fixtureScenario({
        demand: {
          curve: [
            { minute: 0, tripsPerMinute: 20 },
            { minute: 30, tripsPerMinute: 20 }
          ],
          pairs: [{ origin: "o", destination: "d", weight: 1 }],
          passengerTolerance: [5, 5]
        }
      })
    );
    engine.reset(1);
    engine.step({ type: "DELAY_DEPARTURES", destination: "d", durationMinutes: 10, percentage: 1 });
    const before = engine.getState().metrics.objective;
    for (let i = 0; i < 8; i++) engine.step({ type: "NO_OP" });
    expect(engine.getState().metrics.waitingTrips).toBeGreaterThan(0);
    expect(engine.getState().metrics.objective).toBeGreaterThan(before);
  });

  it("stranded trips with unavailable routes accrue delay and dissatisfaction", () => {
    const scenario = fixtureScenario({
      graph: {
        nodes: [
          { id: "o", x: 0, y: 0, type: "origin" },
          { id: "d", x: 1, y: 0, type: "destination" }
        ],
        edges: []
      }
    });
    const engine = new SimulationEngine(scenario);
    engine.reset(1);
    engine.step({ type: "DEBUG_SPAWN", count: 3 });
    for (let i = 0; i < 4; i++) engine.step({ type: "NO_OP" });
    const metrics = engine.getState().metrics;
    expect(metrics.waitingTrips).toBe(3);
    expect(metrics.departureDelay).toBeGreaterThan(0);
    expect(metrics.averageSatisfaction).toBeLessThan(100);
    expect(metrics.objective).toBeGreaterThan(0);
  });

  it("excess distance uses kilometers consistently", () => {
    const graph = new TrafficGraph({
      nodes: [
        { id: "o", x: 0, y: 0, type: "origin" },
        { id: "d", x: 1, y: 0, type: "destination" }
      ],
      edges: [{ id: "road", from: "o", to: "d", lengthKm: 10, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20 }]
    });
    const metrics = calculateMetrics({
      vehicles: [
        {
          id: "v",
          origin: "o",
          destination: "d",
          route: ["road"],
          currentEdgeIndex: 0,
          edgeProgress: 1,
          requestedDepartureTime: 0,
          actualDepartureTime: 0,
          actualArrivalTime: 10,
          baselineTravelTime: 4,
          baselineDistanceKm: 4,
          status: "arrived",
          passengerTolerance: 20,
          satisfaction: 100,
          rerouteCount: 0,
          distanceKm: 10
        }
      ],
      waitingTrips: [],
      graph,
      congestionCost: 0,
      departureDelay: 0,
      weights: { ...baseWeights, travelTime: 0, congestion: 0, departureDelay: 0, dissatisfaction: 0, excessDistance: 1 },
      utilizationThreshold: 1,
      currentTime: 10,
      satisfaction: { departureDelay: 1, lateDelay: 1, reroute: 1 }
    });
    expect(metrics.excessDistance).toBe(6);
    expect(metrics.objective).toBe(6);
  });

  it("empty-network satisfaction starts at 100", () => {
    const engine = new SimulationEngine(fixtureScenario());
    engine.reset(1);
    expect(engine.getState().metrics.averageSatisfaction).toBe(100);
  });

  it("getReward equals the latest step reward", () => {
    const engine = new SimulationEngine(fixtureScenario());
    engine.reset(1);
    const result = engine.step({ type: "DEBUG_SPAWN", count: 1 });
    expect(engine.getReward()).toBe(result.reward);
  });

  it("arrival timestamps never exceed current simulation time", () => {
    const scenario = fixtureScenario({
      graph: {
        nodes: [
          { id: "o", x: 0, y: 0, type: "origin" },
          { id: "d", x: 1, y: 0, type: "destination" }
        ],
        edges: [{ id: "quick", from: "o", to: "d", lengthKm: 0.25, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20 }]
      }
    });
    const engine = new SimulationEngine(scenario);
    engine.reset(1);
    engine.step({ type: "DEBUG_SPAWN", count: 1 });
    for (let i = 0; i < 4; i++) engine.step({ type: "NO_OP" });
    const state = engine.getState();
    const arrived = state.vehicles.find((vehicle) => vehicle.status === "arrived");
    expect(arrived?.actualArrivalTime).toBeLessThanOrEqual(state.time);
  });
});

describe("forecast, replay, speed independence", () => {
  it("forecast and preview do not change live state, logs, RNG, or future outcomes", () => {
    const untouched = new SimulationEngine(mondayMorningScenario);
    const inspected = new SimulationEngine(mondayMorningScenario);
    untouched.reset(8);
    inspected.reset(8);
    for (let i = 0; i < 40; i++) {
      untouched.step({ type: "NO_OP" });
      inspected.step({ type: "NO_OP" });
    }
    const before = JSON.stringify(inspected.getObservation());
    const beforeRun = JSON.stringify(inspected.createRun());
    inspected.getInfo();
    inspected.previewAction({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 });
    expect(JSON.stringify(inspected.getObservation())).toBe(before);
    expect(JSON.stringify(inspected.createRun())).toBe(beforeRun);
    for (let i = 0; i < 30; i++) {
      untouched.step({ type: "NO_OP" });
      inspected.step({ type: "NO_OP" });
    }
    expect(inspected.getState().metrics).toEqual(untouched.getState().metrics);
  });

  it("forecasts match a no-action rollout at each horizon", () => {
    const forecasted = new SimulationEngine(mondayMorningScenario);
    forecasted.reset(9);
    forecasted.step({ type: "DEBUG_SPAWN", count: 200 });
    const forecasts = forecasted.getInfo().forecasts;
    const rollout = new SimulationEngine(mondayMorningScenario);
    rollout.reset(9);
    rollout.step({ type: "DEBUG_SPAWN", count: 200 });
    const utilizationAt = (ticks: number) => {
      for (let i = 0; i < ticks; i++) rollout.step({ type: "NO_OP" });
      return rollout.getState().graph.edge("north_bridge").currentVehicleCount /
        Math.max(1, rollout.getState().graph.edge("north_bridge").comfortableCapacity * rollout.getState().graph.edge("north_bridge").capacityModifier);
    };
    const north = forecasts.find((forecast) => forecast.edgeId === "north_bridge");
    expect(north?.utilization5m).toBeCloseTo(utilizationAt(20), 6);
    expect(north?.utilization10m).toBeCloseTo(utilizationAt(20), 6);
    expect(north?.utilization15m).toBeCloseTo(utilizationAt(20), 6);
  });

  it("preview predictions match equivalent real-action rollouts", () => {
    const source = new SimulationEngine(mondayMorningScenario);
    source.reset(11);
    source.step({ type: "DEBUG_SPAWN", count: 300 });
    for (let i = 0; i < 5; i++) source.step({ type: "NO_OP" });
    const action = { type: "REROUTE" as const, targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.5 };
    const preview = source.previewAction(action);

    const noAction = new SimulationEngine(mondayMorningScenario);
    const withAction = new SimulationEngine(mondayMorningScenario);
    for (const engine of [noAction, withAction]) {
      engine.reset(11);
      engine.step({ type: "DEBUG_SPAWN", count: 300 });
      for (let i = 0; i < 5; i++) engine.step({ type: "NO_OP" });
    }
    noAction.step({ type: "NO_OP" });
    withAction.step(action);
    for (let i = 0; i < 59; i++) {
      noAction.step({ type: "NO_OP" });
      withAction.step({ type: "NO_OP" });
    }
    expect(preview.networkCostDelta).toBeCloseTo(
      withAction.getState().metrics.objective - noAction.getState().metrics.objective,
      6
    );
  });

  it("previews count only genuinely eligible reroute vehicles", () => {
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(12);
    engine.step({ type: "DEBUG_SPAWN", count: 300 });
    for (let i = 0; i < 18; i++) engine.step({ type: "NO_OP" });
    const eligible = engine
      .getState()
      .vehicles.filter(
        (vehicle) =>
          vehicle.status === "traveling" && vehicle.route.slice(vehicle.currentEdgeIndex + 1).includes("north_bridge")
      ).length;
    const preview = engine.previewAction({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 1 });
    expect(preview.affectedVehicles).toBe(eligible);
  });

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
