import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, canUseDevTools } from "../components/App";
import { calculateForecast, type ForecastRequest } from "../workers/forecastWorker";
import { calculateBaseline, type BaselineRequest } from "../workers/baselineWorker";
import { EndScreen } from "../components/EndScreen";
import { TutorialCoach } from "../components/TutorialCoach";
import { RoadInspector } from "../components/RoadInspector";
import { useGameStore } from "../game/GameStore";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { SeededRandom } from "../simulation/core/SeededRandom";
import { TrafficGraph } from "../simulation/network/TrafficGraph";
import { Router } from "../simulation/network/Router";
import { travelTime } from "../simulation/traffic/CongestionModel";
import { calculateMetrics } from "../simulation/scoring/Metrics";
import { replayRun } from "../simulation/logging/Replay";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import { practiceCheckpointTicks, practiceScenario } from "../simulation/scenarios/PracticeScenario";
import type { GraphConfig, RoadEdge } from "../simulation/network/types";
import type { ActionPreview, Scenario, SimulationAction, SimulationSnapshot } from "../simulation/types";

const congestion = { alpha: 0.15, beta: 4, utilizationThreshold: 0.82 };
const baseWeights = { travelTime: 1, congestion: 10, departureDelay: 2, dissatisfaction: 1, excessDistance: 1 };
const fakeWorkers: FakePreviewWorker[] = [];

class FakePreviewWorker {
  static failNext = false;

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  constructor(readonly url?: URL) {
    fakeWorkers.push(this);
  }

  postMessage(message: { requestId: number; sessionId: number; snapshot: SimulationSnapshot; action: SimulationAction } | BaselineRequest | ForecastRequest) {
    window.setTimeout(() => {
      if (this.terminated) return;
      if ("kind" in message) { this.onmessage?.({ data: message.kind === "baseline" ? calculateBaseline(message) : calculateForecast(message) } as MessageEvent); return; }
      if (FakePreviewWorker.failNext) {
        FakePreviewWorker.failNext = false;
        this.onerror?.(new ErrorEvent("error", { message: "forced worker failure" }));
        return;
      }
      const started = performance.now();
      const engine = new SimulationEngine(message.snapshot.scenario);
      engine.restoreFromSnapshot(message.snapshot);
      const result = engine.previewAction(message.action);
      this.onmessage?.({
        data: {
          requestId: message.requestId,
          sessionId: message.sessionId,
          result,
          timings: { roundTripStartedAt: started, calculationMs: performance.now() - started }
        }
      } as MessageEvent);
    }, 0);
  }

  terminate() {
    this.terminated = true;
  }
}

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

function restoreWithWaiting(scenario: Scenario, waiting: SimulationSnapshot["waiting"]) {
  const engine = new SimulationEngine(scenario);
  engine.reset(scenario.seed ?? 1);
  const snapshot = engine.exportSnapshot();
  engine.restoreFromSnapshot({
    ...snapshot,
    waiting: waiting.map((trip) => ({ ...trip })),
    metrics: { ...snapshot.metrics, waitingTrips: waiting.length }
  });
  return engine;
}

function routeHoldScenario(): Scenario {
  return fixtureScenario({
    graph: {
      nodes: [
        { id: "o1", x: 0, y: 0, type: "origin" },
        { id: "o2", x: 0, y: 1, type: "origin" },
        { id: "a", x: 1, y: 0, type: "intersection" },
        { id: "d1", x: 2, y: 0, type: "destination" },
        { id: "d2", x: 2, y: 1, type: "destination" }
      ],
      edges: [
        { id: "north_bridge", from: "o1", to: "a", lengthKm: 1, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20 },
        { id: "target_exit", from: "a", to: "d1", lengthKm: 1, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20 },
        { id: "unrelated", from: "o2", to: "d2", lengthKm: 1, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20 }
      ]
    },
    demand: {
      curve: [
        { minute: 0, tripsPerMinute: 0 },
        { minute: 30, tripsPerMinute: 0 }
      ],
      pairs: [
        { origin: "o1", destination: "d1", weight: 1 },
        { origin: "o2", destination: "d2", weight: 1 }
      ],
      passengerTolerance: [5, 5]
    }
  });
}

function slowOnlyScenario(overrides: Partial<Scenario> = {}): Scenario {
  return fixtureScenario({
    graph: {
      nodes: [
        { id: "o", x: 0, y: 0, type: "origin" },
        { id: "d", x: 2, y: 0, type: "destination" }
      ],
      edges: [{ id: "slow", from: "o", to: "d", lengthKm: 30, speedLimitKph: 30, comfortableCapacity: 10, maximumCapacity: 20, major: true }]
    },
    ...overrides
  });
}

function renderInspector() {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => {
    root.render(<RoadInspector />);
  });
  return { host, root };
}

function renderApp() {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => {
    root.render(<App />);
  });
  return { host, root };
}

function clickButton(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(label));
  expect(button).toBeTruthy();
  act(() => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function makeNearEndPreviewStoreState() {
  const scenario = slowOnlyScenario({
    endTime: 1,
    forecast: { horizonsMinutes: [5, 10, 15], refreshIntervalMinutes: 0.25, warningUtilization: 1, criticalUtilization: 1.2, previewHorizonMinutes: 15 }
  });
  const engine = new SimulationEngine(scenario);
  engine.reset(50);
  for (let i = 0; i < 3; i++) engine.step({ type: "NO_OP" });
  const action = { type: "DEBUG_SPAWN" as const, count: 1 };
  const result = engine.previewAction(action);
  useGameStore.setState({
    engine,
    version: 3,
    selectedEdgeId: "slow",
    preview: {
      status: "ready",
      action,
      result,
      baseVersion: 3,
      baseSessionId: 999,
      requestId: 999,
      targetEdgeId: "slow",
      error: null,
      timings: { roundTripMs: 10, calculationMs: 5 }
    }
  });
  return result;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fakeWorkers.length = 0;
  FakePreviewWorker.failNext = false;
  useGameStore.getState().reset();
});

beforeEach(() => {
  vi.stubGlobal("Worker", FakePreviewWorker);
});

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
      congestion: { alpha: 0, beta: 4, utilizationThreshold: 0.8 },
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
  it("short trips cannot arrive before departure", () => {
    const scenario = fixtureScenario({
      congestion: { alpha: 0, beta: 4, utilizationThreshold: 0.8 },
      graph: {
        nodes: [
          { id: "o", x: 0, y: 0, type: "origin" },
          { id: "d", x: 1, y: 0, type: "destination" }
        ],
        edges: [{ id: "quick", from: "o", to: "d", lengthKm: 0.1, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20 }]
      }
    });
    const engine = new SimulationEngine(scenario);
    engine.reset(1);
    engine.step({ type: "DEBUG_SPAWN", count: 1 });
    const vehicle = engine.getState().vehicles[0];
    expect(vehicle.actualDepartureTime).toBe(0);
    expect(vehicle.actualArrivalTime).toBeCloseTo(0.1, 6);
    expect((vehicle.actualArrivalTime ?? 0) - (vehicle.actualDepartureTime ?? 0)).toBeGreaterThanOrEqual(0);
  });

  it("free-flow travel duration is exact across multiple edges in one tick", () => {
    const scenario = fixtureScenario({
      congestion: { alpha: 0, beta: 4, utilizationThreshold: 0.8 },
      graph: {
        nodes: [
          { id: "o", x: 0, y: 0, type: "origin" },
          { id: "a", x: 1, y: 0, type: "intersection" },
          { id: "d", x: 2, y: 0, type: "destination" }
        ],
        edges: [
          { id: "e1", from: "o", to: "a", lengthKm: 0.05, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20 },
          { id: "e2", from: "a", to: "d", lengthKm: 0.05, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20 }
        ]
      }
    });
    const engine = new SimulationEngine(scenario);
    engine.reset(1);
    engine.step({ type: "DEBUG_SPAWN", count: 1 });
    const vehicle = engine.getState().vehicles[0];
    expect(vehicle.actualArrivalTime).toBeCloseTo(0.1, 6);
    expect(vehicle.distanceKm).toBeCloseTo(0.1, 6);
  });

  it("newly generated demand waits until the next tick before moving", () => {
    const scenario = fixtureScenario({
      demand: {
        curve: [
          { minute: 0, tripsPerMinute: 4 },
          { minute: 30, tripsPerMinute: 4 }
        ],
        pairs: [{ origin: "o", destination: "d", weight: 1 }],
        passengerTolerance: [5, 5]
      }
    });
    const engine = new SimulationEngine(scenario);
    engine.reset(1);
    engine.step({ type: "NO_OP" });
    expect(engine.getState().waiting.length).toBe(1);
    expect(engine.getState().vehicles.length).toBe(0);
    engine.step({ type: "NO_OP" });
    const vehicle = engine.getState().vehicles[0];
    expect(vehicle.actualDepartureTime).toBe(0.25);
    expect(vehicle.actualArrivalTime ?? vehicle.actualDepartureTime).toBeGreaterThanOrEqual(vehicle.actualDepartureTime ?? 0);
  });

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
  it("reset matches a fresh engine for initial state and future outcomes", () => {
    const used = new SimulationEngine(mondayMorningScenario);
    used.reset(22);
    used.step({ type: "DEBUG_SPAWN", count: 100 });
    for (let i = 0; i < 10; i++) used.step({ type: "NO_OP" });
    used.reset(22);

    const fresh = new SimulationEngine(mondayMorningScenario);
    fresh.reset(22);
    expect(used.getObservation()).toEqual(fresh.getObservation());
    expect(used.getInfo()).toEqual(fresh.getInfo());
    for (let i = 0; i < 20; i++) {
      used.step({ type: "NO_OP" });
      fresh.step({ type: "NO_OP" });
    }
    expect(used.getState().metrics).toEqual(fresh.getState().metrics);
  });

  it("mutating input actions or exported logs cannot change internal history", () => {
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(23);
    const action = { type: "DEBUG_SPAWN" as const, count: 10 };
    engine.step(action);
    action.count = 999;
    const exported = engine.createRun();
    exported.actions[0].action = { type: "DEBUG_SPAWN", count: 999 };
    expect(engine.createRun().actions[0].action).toEqual({ type: "DEBUG_SPAWN", count: 10 });
  });

  it("mutating returned state cannot change future outcomes", () => {
    const clean = new SimulationEngine(mondayMorningScenario);
    const mutated = new SimulationEngine(mondayMorningScenario);
    clean.reset(24);
    mutated.reset(24);
    const returned = mutated.getState();
    returned.metrics.objective = 999999;
    returned.vehicles.push({} as never);
    for (let i = 0; i < 20; i++) {
      clean.step({ type: "NO_OP" });
      mutated.step({ type: "NO_OP" });
    }
    expect(mutated.getState().metrics).toEqual(clean.getState().metrics);
  });

  it("mutating returned forecast samples cannot change internal forecasts or alerts", () => {
    const scenario = slowOnlyScenario({
      forecast: { horizonsMinutes: [5, 10, 15], refreshIntervalMinutes: 0.25, warningUtilization: 0, criticalUtilization: 1.2, previewHorizonMinutes: 5 }
    });
    const engine = new SimulationEngine(scenario);
    engine.reset(45);
    engine.step({ type: "DEBUG_SPAWN", count: 1 });
    const originalForecast = engine.getState().forecasts[0].samples[0].utilization;
    const originalAlerts = JSON.stringify(engine.getState().alerts);

    const state = engine.getState();
    state.forecasts[0].samples[0].utilization = 999;
    const info = engine.getInfo();
    info.forecasts[0].samples[0].utilization = 777;

    expect(engine.getState().forecasts[0].samples[0].utilization).toBe(originalForecast);
    expect(JSON.stringify(engine.getState().alerts)).toBe(originalAlerts);
  });

  it("mutating an exported snapshot cannot change internal forecasts, alerts, or future outcomes", () => {
    const scenario = slowOnlyScenario({
      forecast: { horizonsMinutes: [5, 10, 15], refreshIntervalMinutes: 0.25, warningUtilization: 0, criticalUtilization: 1.2, previewHorizonMinutes: 5 }
    });
    const clean = new SimulationEngine(scenario);
    const inspected = new SimulationEngine(scenario);
    clean.reset(46);
    inspected.reset(46);
    for (const engine of [clean, inspected]) engine.step({ type: "DEBUG_SPAWN", count: 1 });

    const snapshot = inspected.exportSnapshot();
    snapshot.forecasts[0].samples[0].utilization = 999;
    snapshot.alerts[0].predicted = 999;

    expect(inspected.getState().forecasts[0].samples[0].utilization).not.toBe(999);
    expect(inspected.getState().alerts[0].predicted).not.toBe(999);
    for (let i = 0; i < 8; i++) {
      clean.step({ type: "NO_OP" });
      inspected.step({ type: "NO_OP" });
    }
    expect(inspected.getState().metrics).toEqual(clean.getState().metrics);
  });

  it("mutating input snapshots after restoration cannot change restored forecasts, alerts, or future outcomes", () => {
    const scenario = slowOnlyScenario({
      forecast: { horizonsMinutes: [5, 10, 15], refreshIntervalMinutes: 0.25, warningUtilization: 0, criticalUtilization: 1.2, previewHorizonMinutes: 5 }
    });
    const source = new SimulationEngine(scenario);
    source.reset(47);
    source.step({ type: "DEBUG_SPAWN", count: 1 });
    const snapshot = source.exportSnapshot();
    const cleanSnapshot = source.exportSnapshot();
    const restored = new SimulationEngine(scenario);
    const expected = new SimulationEngine(scenario);
    restored.restoreFromSnapshot(snapshot);
    expected.restoreFromSnapshot(cleanSnapshot);

    snapshot.forecasts[0].samples[0].utilization = 999;
    snapshot.alerts[0].predicted = 999;
    snapshot.vehicles.push({} as never);

    expect(restored.getState().forecasts[0].samples[0].utilization).not.toBe(999);
    expect(restored.getState().alerts[0].predicted).not.toBe(999);
    for (let i = 0; i < 8; i++) {
      restored.step({ type: "NO_OP" });
      expected.step({ type: "NO_OP" });
    }
    expect(restored.getState().metrics).toEqual(expected.getState().metrics);
  });

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

  it("preview utilization changes match real rollouts at displayed horizons", () => {
    const source = new SimulationEngine(mondayMorningScenario);
    source.reset(31);
    source.step({ type: "DEBUG_SPAWN", count: 400 });
    for (let i = 0; i < 5; i++) source.step({ type: "NO_OP" });
    const action = { type: "REROUTE" as const, targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.5 };
    const preview = source.previewAction(action);
    const change = preview.forecastChanges.find((item) => item.edgeId === "north_bridge" && item.horizonMinutes === 5);
    expect(change).toBeDefined();

    const noAction = new SimulationEngine(mondayMorningScenario);
    const withAction = new SimulationEngine(mondayMorningScenario);
    for (const engine of [noAction, withAction]) {
      engine.reset(31);
      engine.step({ type: "DEBUG_SPAWN", count: 400 });
      for (let i = 0; i < 5; i++) engine.step({ type: "NO_OP" });
    }
    withAction.step(action);
    noAction.step({ type: "NO_OP" });
    for (let i = 0; i < 19; i++) {
      withAction.step({ type: "NO_OP" });
      noAction.step({ type: "NO_OP" });
    }
    const noEdge = noAction.getState().graph.edge("north_bridge");
    const actionEdge = withAction.getState().graph.edge("north_bridge");
    expect(change?.before).toBeCloseTo(noEdge.currentVehicleCount / (noEdge.comfortableCapacity * noEdge.capacityModifier), 6);
    expect(change?.after).toBeCloseTo(actionEdge.currentVehicleCount / (actionEdge.comfortableCapacity * actionEdge.capacityModifier), 6);
  });

  it("passenger-delay preview reports total and per-passenger units", () => {
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(32);
    engine.step({ type: "DEBUG_SPAWN", count: 100 });
    const preview = engine.previewAction({ type: "DELAY_DEPARTURES", destination: "downtown", durationMinutes: 5, percentage: 0.5 });
    expect(Number.isFinite(preview.passengerDelayDeltaMinutes)).toBe(true);
    expect(Number.isFinite(preview.passengerDelayDeltaPerPassenger)).toBe(true);
    expect(Math.abs(preview.passengerDelayDeltaMinutes)).toBeGreaterThanOrEqual(Math.abs(preview.passengerDelayDeltaPerPassenger));
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

  it("no-alternative-route vehicles are excluded from successful reroute counts", () => {
    const scenario = fixtureScenario({
      graph: {
        nodes: [
          { id: "o", x: 0, y: 0, type: "origin" },
          { id: "a", x: 1, y: 0, type: "intersection" },
          { id: "b", x: 2, y: 0, type: "intersection" },
          { id: "d", x: 3, y: 0, type: "destination" }
        ],
        edges: [
          { id: "approach", from: "o", to: "a", lengthKm: 1, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20 },
          { id: "target", from: "a", to: "b", lengthKm: 1, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20, major: true },
          { id: "exit", from: "b", to: "d", lengthKm: 1, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20 }
        ]
      }
    });
    const engine = new SimulationEngine(scenario);
    engine.reset(33);
    engine.step({ type: "DEBUG_SPAWN", count: 1 });
    const preview = engine.previewAction({ type: "REROUTE", targetEdge: "target", avoidEdge: "target", percentage: 1 });
    expect(preview.affectedVehicles).toBe(0);
  });

  it("hold and release previews report actual changed trips", () => {
    const scenario = fixtureScenario({
      demand: {
        curve: [
          { minute: 0, tripsPerMinute: 4 },
          { minute: 30, tripsPerMinute: 4 }
        ],
        pairs: [{ origin: "o", destination: "d", weight: 1 }],
        passengerTolerance: [5, 5]
      }
    });
    const engine = new SimulationEngine(scenario);
    engine.reset(34);
    engine.step({ type: "NO_OP" });
    const hold = engine.previewAction({ type: "DELAY_DEPARTURES", destination: "d", durationMinutes: 5, percentage: 1 });
    expect(hold.affectedVehicles).toBe(1);
    engine.step({ type: "DELAY_DEPARTURES", destination: "d", durationMinutes: 5, percentage: 1 });
    const release = engine.previewAction({ type: "RELEASE_DEPARTURES", destination: "d" });
    expect(release.affectedVehicles).toBe(1);
  });

  it("North Bridge holds affect eligible waiting trips by planned route", () => {
    const scenario = routeHoldScenario();
    const engine = restoreWithWaiting(scenario, [
      { id: "target_1", origin: "o1", destination: "d1", requestedDepartureTime: 0, passengerTolerance: 5 },
      { id: "target_2", origin: "o1", destination: "d1", requestedDepartureTime: 0, passengerTolerance: 5 },
      { id: "other_1", origin: "o2", destination: "d2", requestedDepartureTime: 0, passengerTolerance: 5 }
    ]);
    engine.step({ type: "DELAY_DEPARTURES", targetEdge: "north_bridge", durationMinutes: 5, percentage: 1 });
    const held = engine.getState().waiting.filter((trip) => trip.heldUntil !== undefined).map((trip) => trip.id);
    expect(held).toEqual(["target_1", "target_2"]);
  });

  it("trips whose routes avoid the selected road remain unaffected by holds", () => {
    const scenario = routeHoldScenario();
    const engine = restoreWithWaiting(scenario, [
      { id: "other_1", origin: "o2", destination: "d2", requestedDepartureTime: 0, passengerTolerance: 5 },
      { id: "other_2", origin: "o2", destination: "d2", requestedDepartureTime: 0, passengerTolerance: 5 }
    ]);
    engine.step({ type: "DELAY_DEPARTURES", targetEdge: "north_bridge", durationMinutes: 5, percentage: 1 });
    expect(engine.getState().waiting.every((trip) => trip.heldUntil === undefined)).toBe(true);
  });

  it("preview affected counts match real hold execution", () => {
    const scenario = routeHoldScenario();
    const waiting = [
      { id: "target_1", origin: "o1", destination: "d1", requestedDepartureTime: 0, passengerTolerance: 5 },
      { id: "target_2", origin: "o1", destination: "d1", requestedDepartureTime: 0, passengerTolerance: 5 },
      { id: "other_1", origin: "o2", destination: "d2", requestedDepartureTime: 0, passengerTolerance: 5 }
    ];
    const previewEngine = restoreWithWaiting(scenario, waiting);
    const realEngine = restoreWithWaiting(scenario, waiting);
    const action = { type: "DELAY_DEPARTURES" as const, targetEdge: "north_bridge", durationMinutes: 5, percentage: 1 };
    const preview = previewEngine.previewAction(action);
    realEngine.step(action);
    expect(preview.affectedVehicles).toBe(realEngine.getState().waiting.filter((trip) => trip.heldUntil !== undefined).length);
  });

  it("worker preview protocol exactly matches synchronous preview from the same snapshot", async () => {
    vi.useFakeTimers();
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(35);
    engine.step({ type: "DEBUG_SPAWN", count: 200 });
    const snapshot = engine.exportSnapshot();
    const action = { type: "REROUTE" as const, targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 };
    const sync = engine.previewAction(action);
    const worker = new FakePreviewWorker();
    const response = new Promise<ActionPreview>((resolve) => {
      worker.onmessage = (event) => resolve(event.data.result);
    });
    worker.postMessage({ requestId: 1, sessionId: 1, snapshot, action });
    await vi.runAllTimersAsync();
    await expect(response).resolves.toEqual(sync);
    worker.terminate();
  });

  it("snapshot round trips preserve deterministic future outcomes", () => {
    const original = new SimulationEngine(mondayMorningScenario);
    original.reset(36);
    original.step({ type: "DEBUG_SPAWN", count: 150 });
    for (let i = 0; i < 12; i++) original.step({ type: "NO_OP" });
    const restored = new SimulationEngine(mondayMorningScenario);
    restored.restoreFromSnapshot(original.exportSnapshot());
    for (let i = 0; i < 30; i++) {
      original.step({ type: "NO_OP" });
      restored.step({ type: "NO_OP" });
    }
    expect(restored.getState().metrics).toEqual(original.getState().metrics);
    expect(restored.getState().vehicles).toEqual(original.getState().vehicles);
  });

  it("a preview horizon different from forecast horizons uses the preview horizon for score deltas", () => {
    const scenario = fixtureScenario({
      forecast: {
        horizonsMinutes: [5, 10, 15],
        refreshIntervalMinutes: 1,
        warningUtilization: 0.9,
        criticalUtilization: 1.2,
        previewHorizonMinutes: 7
      }
    });
    const source = new SimulationEngine(scenario);
    source.reset(37);
    const action = { type: "DEBUG_SPAWN" as const, count: 1 };
    const preview = source.previewAction(action);
    const noAction = new SimulationEngine(scenario);
    const withAction = new SimulationEngine(scenario);
    noAction.reset(37);
    withAction.reset(37);
    withAction.step(action);
    noAction.step({ type: "NO_OP" });
    for (let i = 0; i < 27; i++) {
      noAction.step({ type: "NO_OP" });
      withAction.step({ type: "NO_OP" });
    }
    expect(preview.horizonMinutes).toBe(7);
    expect(preview.networkCostDelta).toBeCloseTo(withAction.getState().metrics.objective - noAction.getState().metrics.objective, 6);
  });

  it("near-end previews report truncation honestly", () => {
    const scenario = fixtureScenario({ endTime: 1, forecast: { horizonsMinutes: [5, 10, 15], refreshIntervalMinutes: 1, warningUtilization: 1, criticalUtilization: 1.2, previewHorizonMinutes: 5 } });
    const engine = new SimulationEngine(scenario);
    engine.reset(38);
    for (let i = 0; i < 3; i++) engine.step({ type: "NO_OP" });
    const preview = engine.previewAction({ type: "DEBUG_SPAWN", count: 1 });
    expect(preview.truncated).toBe(true);
    expect(preview.horizonMinutes).toBeCloseTo(0.25, 6);
    expect(preview.forecastChanges.every((change) => change.actualHorizonMinutes <= 0.25)).toBe(true);
  });

  it("non-major selected roads receive preview utilization results", () => {
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(39);
    const preview = engine.previewAction({ type: "DELAY_DEPARTURES", targetEdge: "downtown_core", durationMinutes: 5, percentage: 1 });
    expect(preview.forecastChanges.some((change) => change.edgeId === "downtown_core")).toBe(true);
  });

  it("road forecast labels never claim predictions beyond scenario end", () => {
    const scenario = slowOnlyScenario({
      endTime: 1,
      forecast: { horizonsMinutes: [5, 10, 15], refreshIntervalMinutes: 0.25, warningUtilization: 0, criticalUtilization: 1.2, previewHorizonMinutes: 5 }
    });
    const engine = new SimulationEngine(scenario);
    engine.reset(40);
    engine.step({ type: "DEBUG_SPAWN", count: 1 });
    for (let i = 0; i < 2; i++) engine.step({ type: "NO_OP" });
    const forecast = engine.getState().forecasts.find((item) => item.edgeId === "slow");
    expect(forecast?.samples).toEqual([
      { requestedHorizonMinutes: 5, actualHorizonMinutes: 0.25, truncated: true, utilization: expect.any(Number) }
    ]);
    const alert = engine.getState().alerts.find((item) => item.edgeId === "slow");
    expect(alert?.minutesUntil).toBeCloseTo(0.25, 6);
    expect(alert?.truncated).toBe(true);
  });

  it("duplicate truncated preview samples are not presented as separate road changes", () => {
    const scenario = slowOnlyScenario({
      endTime: 1,
      forecast: { horizonsMinutes: [5, 10, 15], refreshIntervalMinutes: 0.25, warningUtilization: 1, criticalUtilization: 1.2, previewHorizonMinutes: 5 }
    });
    const engine = new SimulationEngine(scenario);
    engine.reset(41);
    for (let i = 0; i < 3; i++) engine.step({ type: "NO_OP" });
    const preview = engine.previewAction({ type: "DEBUG_SPAWN", count: 1 });
    const slowChanges = preview.forecastChanges.filter((change) => change.edgeId === "slow");
    expect(slowChanges).toHaveLength(1);
    expect(slowChanges[0]).toMatchObject({
      requestedHorizonMinutes: 5,
      actualHorizonMinutes: 0.25,
      horizonMinutes: 0.25,
      truncated: true
    });
  });

  it("normal 5/10/15 forecast labels remain unchanged when enough time remains", () => {
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(42);
    const forecast = engine.getState().forecasts.find((item) => item.edgeId === "north_bridge");
    expect(forecast?.samples.map((sample) => sample.actualHorizonMinutes)).toEqual([5, 10, 15]);
    expect(forecast?.samples.map((sample) => sample.truncated)).toEqual([false, false, false]);
  });

  it("preview horizon road sample matching uses requested horizon even when forecast horizons differ", () => {
    const scenario = slowOnlyScenario({
      forecast: {
        horizonsMinutes: [5, 10, 15],
        refreshIntervalMinutes: 1,
        warningUtilization: 0.9,
        criticalUtilization: 1.2,
        previewHorizonMinutes: 7
      }
    });
    const engine = new SimulationEngine(scenario);
    engine.reset(43);
    const preview = engine.previewAction({ type: "DEBUG_SPAWN", count: 1 });
    const previewSample = preview.forecastChanges.find(
      (change) => change.edgeId === "slow" && change.requestedHorizonMinutes === preview.requestedHorizonMinutes
    );
    expect(previewSample?.actualHorizonMinutes).toBe(7);
    expect(previewSample?.horizonMinutes).toBe(7);
  });

  it("rejects non-timestep-aligned preview horizons with a clear configuration error", () => {
    const scenario = fixtureScenario({
      forecast: {
        horizonsMinutes: [5, 10, 15],
        refreshIntervalMinutes: 1,
        warningUtilization: 0.9,
        criticalUtilization: 1.2,
        previewHorizonMinutes: 7.1
      }
    });
    const engine = new SimulationEngine(scenario);
    expect(() => engine.reset(44)).toThrow(/align to 0\.25-minute ticks/);
  });

  it("known future demand produces overload forecast", () => {
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(5);
    for (let i = 0; i < 220; i++) engine.step({ type: "NO_OP" });
    expect(engine.getState().alerts.some((alert) => alert.edgeId === "north_bridge")).toBe(true);
  });

  it("replaying action log produces the same final objective", () => {
    // Replay equality does not require a second full Monday integration or forecasts.
    // phase9.test.tsx keeps the full challenge/export/checksum/UI replay coverage.
    const scenario = fixtureScenario({ endTime: 2, evaluation: { maxClearanceMinutes: 20 } });
    const engine = new SimulationEngine(scenario, undefined, true);
    engine.reset(6);
    engine.step({ type: "DEBUG_SPAWN", count: 5 });
    while (!engine.isDone()) engine.step();
    const run = engine.createRun();
    const replay = replayRun(scenario, run);
    expect(run.actions).toHaveLength(1);
    expect(run.evaluation?.finishReason).toBe("all-arrived");
    expect(replay.actions).toEqual(run.actions);
    expect(replay.decisionCutoffMetrics).toEqual(run.decisionCutoffMetrics);
    expect(replay.evaluation).toEqual(run.evaluation);
    expect(replay.finalMetrics?.objective).toBe(run.finalMetrics?.objective);
    expect(replay.finalMetrics).toEqual(run.finalMetrics);
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

describe("preview UI flow", () => {
  it("rendering the inspector does not trigger expensive previews", () => {
    useGameStore.getState().reset();
    const spy = vi.spyOn(useGameStore.getState().engine, "previewAction");
    const { root } = renderInspector();
    expect(spy).not.toHaveBeenCalled();
    act(() => {
      root.unmount();
    });
  });

  it("near-end selected road preview shows measured utilization at scenario end", () => {
    const result = makeNearEndPreviewStoreState();
    const selectedChange = result.forecastChanges.find((change) => change.edgeId === "slow");
    expect(selectedChange?.requestedHorizonMinutes).toBe(5);
    expect(selectedChange?.actualHorizonMinutes).toBe(0.25);
    expect(selectedChange?.before).not.toBe(selectedChange?.after);

    const { host, root } = renderInspector();
    expect(host.textContent).toContain("0% -> 10%");
    expect(host.textContent).toContain("0.25 min (scenario end)");
    expect(host.textContent).not.toContain("No change");
    expect(host.textContent).not.toContain("Unavailable");
    act(() => {
      root.unmount();
    });
  });

  it("normal untruncated selected road previews still show measured utilization", () => {
    const engine = new SimulationEngine(mondayMorningScenario);
    engine.reset(51);
    engine.step({ type: "DEBUG_SPAWN", count: 500 });
    const action = { type: "REROUTE" as const, targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 };
    const result = engine.previewAction(action);
    useGameStore.setState({
      engine,
      version: 1,
      selectedEdgeId: "north_bridge",
      preview: {
        status: "ready",
        action,
        result,
        baseVersion: 1,
        baseSessionId: 1000,
        requestId: 1000,
        targetEdgeId: "north_bridge",
        error: null,
        timings: null
      }
    });

    const { host, root } = renderInspector();
    expect(host.textContent).toMatch(/This road utilization\d+% -> \d+%/);
    expect(host.textContent).toContain("Projection horizon15 min");
    expect(host.textContent).not.toContain("Unavailable");
    act(() => {
      root.unmount();
    });
  });

  it("stale asynchronous preview results are discarded", async () => {
    vi.useFakeTimers();
    useGameStore.getState().reset();
    useGameStore.getState().requestPreview({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 });
    useGameStore.getState().step({ type: "NO_OP" });
    await vi.runAllTimersAsync();
    expect(useGameStore.getState().preview.status).toBe("stale");
  });

  it("same revision and action in different sessions cannot reuse cached results", async () => {
    vi.useFakeTimers();
    useGameStore.getState().reset();
    useGameStore.getState().requestPreview({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 });
    await vi.runAllTimersAsync();
    expect(useGameStore.getState().preview.status).toBe("ready");
    useGameStore.getState().reset();
    useGameStore.getState().requestPreview({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 });
    expect(useGameStore.getState().preview.status).toBe("loading");
    expect(fakeWorkers.filter(worker => !worker.url || worker.url.href.includes("previewWorker"))).toHaveLength(2);
  });

  it("reset clears cached previews and ignores old worker responses", async () => {
    vi.useFakeTimers();
    useGameStore.getState().reset();
    useGameStore.getState().requestPreview({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 });
    useGameStore.getState().reset();
    await vi.runAllTimersAsync();
    expect(useGameStore.getState().preview.status).toBe("idle");
    useGameStore.getState().requestPreview({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 });
    expect(useGameStore.getState().preview.status).toBe("loading");
  });

  it("canceled and superseded worker responses are discarded", async () => {
    vi.useFakeTimers();
    useGameStore.getState().reset();
    useGameStore.getState().requestPreview({ type: "DEBUG_SPAWN", count: 1 });
    useGameStore.getState().cancelPreview();
    await vi.runAllTimersAsync();
    expect(useGameStore.getState().preview.status).toBe("idle");

    useGameStore.getState().requestPreview({ type: "DEBUG_SPAWN", count: 1 });
    useGameStore.getState().requestPreview({ type: "DEBUG_SPAWN", count: 2 });
    await vi.runAllTimersAsync();
    expect(useGameStore.getState().preview.action).toEqual({ type: "DEBUG_SPAWN", count: 2 });
    expect(useGameStore.getState().preview.status).toBe("ready");
  });

  it("mutating input action objects cannot alter pending requests", async () => {
    vi.useFakeTimers();
    useGameStore.getState().reset();
    const action = { type: "DEBUG_SPAWN" as const, count: 5 };
    useGameStore.getState().requestPreview(action);
    action.count = 50;
    await vi.runAllTimersAsync();
    useGameStore.getState().confirmPreview();
    const log = useGameStore.getState().engine.createRun().actions;
    expect(log.at(-1)?.action).toEqual({ type: "DEBUG_SPAWN", count: 5 });
  });

  it("cancel changes nothing and confirm applies the reviewed action once", async () => {
    vi.useFakeTimers();
    useGameStore.getState().reset();
    const beforeCancel = useGameStore.getState().version;
    useGameStore.getState().requestPreview({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 });
    await vi.runAllTimersAsync();
    useGameStore.getState().cancelPreview();
    expect(useGameStore.getState().version).toBe(beforeCancel);

    useGameStore.getState().requestPreview({ type: "DEBUG_SPAWN", count: 5 });
    await vi.runAllTimersAsync();
    useGameStore.getState().confirmPreview();
    expect(useGameStore.getState().version).toBe(beforeCancel + 1);
    expect(useGameStore.getState().engine.createRun().actions.filter((entry) => entry.action.type === "DEBUG_SPAWN")).toHaveLength(1);
  });

  it("worker errors are visible and workers are cleaned up", async () => {
    vi.useFakeTimers();
    useGameStore.getState().reset();
    FakePreviewWorker.failNext = true;
    useGameStore.getState().requestPreview({ type: "DEBUG_SPAWN", count: 1 });
    await vi.runAllTimersAsync();
    expect(useGameStore.getState().preview.status).toBe("error");
    expect(useGameStore.getState().preview.error).toContain("forced worker failure");
    expect(fakeWorkers.at(-1)?.terminated).toBe(true);
  });

  it("changing selected roads cancels an unrelated review", async () => {
    vi.useFakeTimers();
    useGameStore.getState().reset();
    useGameStore.getState().selectEdge("north_bridge");
    useGameStore.getState().requestPreview({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 });
    await vi.runAllTimersAsync();
    expect(useGameStore.getState().preview.status).toBe("ready");
    useGameStore.getState().selectEdge("south_bridge");
    expect(useGameStore.getState().preview.status).toBe("idle");
    useGameStore.getState().confirmPreview();
    expect(useGameStore.getState().engine.createRun().actions).toHaveLength(0);
  });
});

describe("player interface and tutorial", () => {
  it("tutorial progresses through real selection, preview, confirmation, and observed simulation time", async () => {
    vi.useFakeTimers();
    const setItem = vi.fn();
    Object.defineProperty(window, "localStorage", {
      value: { getItem: vi.fn(() => null), setItem },
      configurable: true
    });
    useGameStore.getState().replayTutorial();
    expect(useGameStore.getState().tutorial).toMatchObject({ active: true, step: "intro" });
    useGameStore.getState().advanceTutorial();
    expect(useGameStore.getState().tutorial.step).toBe("select");
    useGameStore.getState().advanceTutorial();
    expect(useGameStore.getState().tutorial.step).toBe("select");
    useGameStore.getState().selectEdge("north_bridge");
    expect(useGameStore.getState().tutorial.step).toBe("forecast");
    useGameStore.getState().advanceTutorial();
    expect(useGameStore.getState().tutorial.step).toBe("preview");

    const action = { type: "REROUTE" as const, targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 };
    useGameStore.getState().requestPreview(action);
    await vi.runAllTimersAsync();
    expect(useGameStore.getState().tutorial.step).toBe("review");
    useGameStore.getState().cancelPreview();
    expect(useGameStore.getState().tutorial).toMatchObject({ step: "preview", message: expect.stringContaining("canceled") });
    useGameStore.getState().requestPreview(action);
    await vi.runAllTimersAsync();
    useGameStore.getState().confirmPreview();
    expect(useGameStore.getState().tutorial.step).toBe("observe");
    expect(useGameStore.getState().engine.createRun().actions.filter((entry) => entry.action.type === "REROUTE")).toHaveLength(1);
    for (let i = 0; i < 10; i++) useGameStore.getState().step();
    expect(useGameStore.getState().tutorial.step).toBe("hold");
    expect(useGameStore.getState().tutorial.observationSummary).toContain("North Bridge");
    useGameStore.getState().advanceTutorial();
    expect(useGameStore.getState().tutorial.step).toBe("complete");
    useGameStore.getState().finishTutorial("monday");
    expect(useGameStore.getState().tutorial).toMatchObject({ active: false, completed: true, step: "complete" });
    expect(useGameStore.getState().scenarioMode).toBe("monday");
    expect(setItem).toHaveBeenCalledWith("centralTrafficTutorialComplete", "1");
  });

  it("skip persists completion and replay starts practice only after help confirmation", () => {
    const setItem = vi.fn();
    Object.defineProperty(window, "localStorage", {
      value: { getItem: vi.fn(() => null), setItem },
      configurable: true
    });
    useGameStore.getState().setScenarioMode("monday");
    const beforeEngine = useGameStore.getState().engine;
    const { host, root } = renderApp();
    clickButton(host, "Help");
    expect(useGameStore.getState().engine).toBe(beforeEngine);
    expect(host.textContent).toContain("Replay Tutorial starts a fresh practice session");
    clickButton(host, "Replay Tutorial");
    expect(useGameStore.getState().engine).toBe(beforeEngine);
    clickButton(host, "Keep Current Run");
    expect(useGameStore.getState().scenarioMode).toBe("monday");
    clickButton(host, "Replay Tutorial");
    clickButton(host, "Start Practice");
    expect(useGameStore.getState().scenarioMode).toBe("practice");
    expect(useGameStore.getState().speed).toBe(0);
    expect(useGameStore.getState().tutorial.step).toBe("intro");
    act(() => root.unmount());
    useGameStore.getState().skipTutorial();
    expect(useGameStore.getState().tutorial).toMatchObject({ active: false, completed: true, step: "complete" });
    expect(useGameStore.getState().speed).toBe(1);
    expect(useGameStore.getState().selectedEdgeId).toBe("north_bridge");
    expect(setItem).toHaveBeenCalledWith("centralTrafficTutorialComplete", "1");
  });

  it("Practice scenario switch opens playable free practice instead of trapping the tutorial", () => {
    useGameStore.getState().setScenarioMode("monday");
    useGameStore.getState().replayTutorial();
    const { host, root } = renderApp();
    clickButton(host, "Practice");
    expect(useGameStore.getState().scenarioMode).toBe("practice");
    expect(useGameStore.getState().tutorial.active).toBe(false);
    expect(useGameStore.getState().speed).toBe(1);
    expect(useGameStore.getState().selectedEdgeId).toBe("north_bridge");
    act(() => {
      root.render(<App />);
    });
    expect(host.textContent).toContain("1x");
    expect(host.textContent).toContain("Hold");
    expect(host.textContent).toContain("Keeps eligible waiting trips off the network briefly");
    expect(host.textContent).not.toContain("Keep The Morning Commute Moving");
    act(() => root.unmount());
  });

  it("help opens and closes without replacing the run and restores playback", () => {
    useGameStore.getState().setScenarioMode("monday");
    useGameStore.getState().setSpeed(2);
    const beforeEngine = useGameStore.getState().engine;
    const beforeActions = beforeEngine.createRun().actions.length;
    const { host, root } = renderApp();
    clickButton(host, "Help");
    expect(useGameStore.getState().engine).toBe(beforeEngine);
    expect(useGameStore.getState().speed).toBe(0);
    expect(beforeEngine.createRun().actions).toHaveLength(beforeActions);
    clickButton(host, "Return To Game");
    expect(useGameStore.getState().engine).toBe(beforeEngine);
    expect(useGameStore.getState().speed).toBe(2);
    act(() => root.unmount());
  });

  it("help cancels pending previews without making old responses confirmable", async () => {
    vi.useFakeTimers();
    useGameStore.getState().setScenarioMode("monday");
    useGameStore.getState().requestPreview({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 });
    expect(useGameStore.getState().preview.status).toBe("loading");
    useGameStore.getState().openHelp();
    expect(useGameStore.getState().preview.status).toBe("idle");
    await vi.runAllTimersAsync();
    useGameStore.getState().confirmPreview();
    expect(useGameStore.getState().engine.createRun().actions).toHaveLength(0);
  });

  it("tutorial state does not affect deterministic simulation or replay logs", () => {
    const withTutorial = new SimulationEngine(mondayMorningScenario);
    const withoutTutorial = new SimulationEngine(mondayMorningScenario);
    withTutorial.reset(61);
    withoutTutorial.reset(61);
    useGameStore.getState().replayTutorial();
    useGameStore.getState().advanceTutorial();
    useGameStore.getState().skipTutorial();
    for (let i = 0; i < 24; i++) {
      withTutorial.step({ type: "NO_OP" });
      withoutTutorial.step({ type: "NO_OP" });
    }
    expect(withTutorial.getState().metrics).toEqual(withoutTutorial.getState().metrics);
    expect(withTutorial.createRun().actions).toEqual(withoutTutorial.createRun().actions);
  });

  it("development controls are hidden until the explicit dev toggle is opened in development", () => {
    useGameStore.getState().setScenarioMode("monday");
    const { host, root } = renderApp();
    expect(host.textContent).not.toContain("Spawn 500");
    act(() => {
      useGameStore.getState().toggleDevTools();
    });
    act(() => {
      root.render(<App />);
    });
    expect(host.textContent).toContain("Spawn 500");
    act(() => {
      root.unmount();
    });
  });

  it("production builds cannot expose debug controls", () => {
    expect(canUseDevTools({ DEV: false })).toBe(false);
    expect(canUseDevTools({ DEV: true })).toBe(true);
  });

  it("advanced controls are revealed at the intended tutorial stages", () => {
    useGameStore.getState().replayTutorial();
    const { host, root } = renderApp();
    expect(host.textContent).not.toContain("Hold trips 5m");
    expect(host.textContent).not.toContain("Detailed stats");
    expect(host.textContent).not.toContain("1x");
    act(() => {
      useGameStore.setState((state) => ({ tutorial: { ...state.tutorial, step: "hold" } }));
    });
    act(() => {
      root.render(<App />);
    });
    expect(host.textContent).toContain("Hold");
    expect(host.textContent).toContain("Keeps eligible waiting trips off the network briefly");
    expect(host.textContent).toContain("Detailed stats");
    expect(host.textContent).toContain("1x");
    act(() => {
      root.unmount();
    });
  });

  it("reset and scenario switching leave tutorial state coherent", () => {
    useGameStore.getState().replayTutorial();
    useGameStore.getState().advanceTutorial();
    useGameStore.getState().selectEdge("north_bridge");
    expect(useGameStore.getState().tutorial.step).toBe("forecast");
    useGameStore.getState().reset();
    expect(useGameStore.getState().tutorial).toMatchObject({ active: true, step: "intro" });
    useGameStore.getState().setScenarioMode("monday");
    expect(useGameStore.getState().tutorial).toMatchObject({ active: false, completed: true, step: "complete" });
  });

  it("changing roads during review returns to a recoverable tutorial step", async () => {
    vi.useFakeTimers();
    useGameStore.getState().replayTutorial();
    useGameStore.setState((state) => ({ tutorial: { ...state.tutorial, step: "preview" }, selectedEdgeId: "north_bridge" }));
    const action = { type: "REROUTE" as const, targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 };
    useGameStore.getState().requestPreview(action);
    await vi.runAllTimersAsync();
    expect(useGameStore.getState().tutorial.step).toBe("review");
    useGameStore.getState().selectEdge("south_bridge");
    expect(useGameStore.getState().preview.status).toBe("idle");
    expect(useGameStore.getState().tutorial).toMatchObject({ step: "select", message: expect.stringContaining("North Bridge") });
    useGameStore.getState().selectEdge("north_bridge");
    expect(useGameStore.getState().tutorial.step).toBe("forecast");
    useGameStore.getState().advanceTutorial();
    useGameStore.getState().requestPreview(action);
    expect(useGameStore.getState().tutorial.step).toBe("review");
    useGameStore.getState().confirmPreview();
    expect(useGameStore.getState().tutorial.step).toBe("observe");
  });

  it("missing or invalid previews cannot advance observation", () => {
    useGameStore.getState().replayTutorial();
    useGameStore.setState((state) => ({ tutorial: { ...state.tutorial, step: "review" }, preview: { ...state.preview, status: "idle", action: null, result: null } }));
    useGameStore.getState().confirmPreview();
    expect(useGameStore.getState().tutorial.step).toBe("review");
    expect(useGameStore.getState().engine.createRun().actions).toHaveLength(0);
  });

  it("preview errors keep the tutorial recoverable", async () => {
    vi.useFakeTimers();
    useGameStore.getState().replayTutorial();
    useGameStore.setState((state) => ({ tutorial: { ...state.tutorial, step: "preview" }, selectedEdgeId: "north_bridge" }));
    FakePreviewWorker.failNext = true;
    useGameStore.getState().requestPreview({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 });
    await vi.runAllTimersAsync();
    expect(useGameStore.getState().tutorial).toMatchObject({ step: "preview", message: expect.stringContaining("failed") });
    expect(useGameStore.getState().preview.status).toBe("error");
  });

  it("zero-affected previews keep the tutorial recoverable", async () => {
    vi.useFakeTimers();
    useGameStore.getState().replayTutorial();
    useGameStore.setState((state) => ({ tutorial: { ...state.tutorial, step: "preview" }, selectedEdgeId: "north_bridge" }));
    useGameStore.getState().requestPreview({ type: "DELAY_DEPARTURES", targetEdge: "north_bridge", durationMinutes: 5, percentage: 0.25 });
    await vi.runAllTimersAsync();
    expect(useGameStore.getState().tutorial).toMatchObject({ step: "preview", message: expect.stringContaining("Try again") });
  });

  it("observation summary reports measured start, end, and elapsed time without over-attribution", async () => {
    vi.useFakeTimers();
    useGameStore.getState().replayTutorial();
    useGameStore.setState((state) => ({ tutorial: { ...state.tutorial, step: "preview" }, selectedEdgeId: "north_bridge" }));
    useGameStore.getState().requestPreview({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 });
    await vi.runAllTimersAsync();
    useGameStore.getState().confirmPreview();
    const start = useGameStore.getState().tutorial.observationStart;
    for (let i = 0; i < 10; i++) useGameStore.getState().step();
    const summary = useGameStore.getState().tutorial.observationSummary ?? "";
    expect(summary).toContain(`North Bridge ${start?.northBridgeVehicles}`);
    expect(summary).toContain("->");
    expect(summary).toContain("South Bridge");
    expect(summary).toContain("2.50 simulated minutes");
    expect(summary).toContain("New demand and normal traffic movement");
    expect(summary).not.toContain("caused");
    expect(summary).not.toContain("prevented");
  });

  it("baseline improvement is not shown before the scenario finishes", () => {
    useGameStore.getState().setScenarioMode("monday");
    useGameStore.setState({ baselineObjective: 10000 });
    const { host, root } = renderApp();
    act(() => {
      const detail = host.querySelector("details");
      detail?.setAttribute("open", "");
      root.render(<App />);
    });
    expect(host.textContent).toContain("Shown at finish");
    act(() => {
      root.unmount();
    });
  });

  it("practice scenario produces a real reroute decision and spillover", () => {
    const setup = (engine: SimulationEngine) => {
      engine.reset(practiceScenario.seed);
      for (let i = 0; i < practiceCheckpointTicks; i++) engine.step({ type: "NO_OP" });
    };
    const noAction = new SimulationEngine(practiceScenario);
    const rerouted = new SimulationEngine(practiceScenario);
    setup(noAction);
    setup(rerouted);
    const action = { type: "REROUTE" as const, targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 };
    const preview = rerouted.previewAction(action);
    expect(preview.affectedVehicles).toBeGreaterThan(0);
    expect(preview.forecastChanges.some((change) => change.edgeId === "north_bridge" && change.before > change.after)).toBe(true);
    rerouted.step(action);
    noAction.step({ type: "NO_OP" });
    for (let i = 0; i < 20; i++) {
      rerouted.step({ type: "NO_OP" });
      noAction.step({ type: "NO_OP" });
    }
    const northNo = noAction.getState().graph.edge("north_bridge").currentVehicleCount;
    const northYes = rerouted.getState().graph.edge("north_bridge").currentVehicleCount;
    expect(northYes).toBeLessThan(northNo);

    for (let i = 0; i < 20; i++) {
      rerouted.step({ type: "NO_OP" });
      noAction.step({ type: "NO_OP" });
    }
    const southNo = noAction.getState().graph.edge("south_bridge").currentVehicleCount;
    const southYes = rerouted.getState().graph.edge("south_bridge").currentVehicleCount;
    expect(southYes).toBeGreaterThan(southNo);
  });
});


describe("explicit preview and final-results interactions", () => {
  function freePractice() {
    useGameStore.getState().startFreePractice();
    useGameStore.getState().setSpeed(4);
  }

  it("hover and keyboard focus preserve speed, engine, logs, and tutorial without starting workers", () => {
    freePractice();
    const before = useGameStore.getState().engine.exportSnapshot();
    const logs = useGameStore.getState().engine.createRun();
    const workers = fakeWorkers.length;
    const tutorial = useGameStore.getState().tutorial;
    const { host, root } = renderInspector();
    act(() => {
      for (const button of host.querySelectorAll(".actionChoice button")) {
        button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      }
    });
    expect(fakeWorkers).toHaveLength(workers);
    expect(useGameStore.getState().speed).toBe(4);
    expect(useGameStore.getState().engine.exportSnapshot()).toEqual(before);
    expect(useGameStore.getState().engine.createRun()).toEqual(logs);
    expect(useGameStore.getState().tutorial).toEqual(tutorial);
    act(() => root.unmount());
  });

  it("clicking Preview pauses once, keeps a separate Apply, and executes the exact reviewed action once", async () => {
    vi.useFakeTimers();
    freePractice();
    const { host, root } = renderInspector();
    const engine = useGameStore.getState().engine;
    const step = vi.spyOn(engine, "step");
    const workers = fakeWorkers.length;
    clickButton(host, "Preview Reroute");
    expect(fakeWorkers).toHaveLength(workers + 1);
    expect(useGameStore.getState().speed).toBe(0);
    expect(host.textContent).toContain("Calculating preview");
    await act(async () => { await vi.runAllTimersAsync(); });
    const reviewed = { ...useGameStore.getState().preview.action! };
    expect(step).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Other affected roads");
    expect(host.textContent).toContain("South Bridge");
    expect(host.textContent).toContain("passenger-minutes");
    expect(host.textContent).toContain("minutes per rider");
    expect(host.textContent).toContain("lower cost is better");
    expect(host.textContent).toContain("no further intervention");
    expect(host.textContent).not.toContain("Score");
    // The original card can only request another review, even when a result is ready.
    clickButton(host, "Preview Reroute");
    expect(step).not.toHaveBeenCalled();
    const apply = [...host.querySelectorAll("button")].find(button => button.textContent === "Apply")!;
    act(() => {
      apply.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      apply.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(step).toHaveBeenCalledTimes(1);
    expect(step).toHaveBeenCalledWith(reviewed);
    expect(engine.createRun().actions.filter(entry => entry.action.type === "REROUTE")).toHaveLength(1);
    act(() => root.unmount());
  });

  it("Cancel leaves state and logs unchanged and explicitly offers Resume", async () => {
    vi.useFakeTimers();
    freePractice();
    const { host, root } = renderInspector();
    const before = useGameStore.getState().engine.exportSnapshot();
    const logs = useGameStore.getState().engine.createRun();
    clickButton(host, "Preview Hold");
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(host.textContent).toContain("Hold 25% of eligible waiting trips for 5 min");
    clickButton(host, "Cancel");
    expect(useGameStore.getState().engine.exportSnapshot()).toEqual(before);
    expect(useGameStore.getState().engine.createRun()).toEqual(logs);
    expect(host.textContent).toContain("No action applied");
    clickButton(host, "Resume 1x");
    expect(useGameStore.getState().speed).toBe(1);
    act(() => root.unmount());
  });

  it("stale reviews cannot apply and Retry and reset recover through the UI", async () => {
    vi.useFakeTimers();
    freePractice();
    const { host, root } = renderInspector();
    FakePreviewWorker.failNext = true;
    clickButton(host, "Preview Reroute");
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(host.textContent).toContain("forced worker failure");
    clickButton(host, "Retry");
    await act(async () => { await vi.runAllTimersAsync(); });
    const oldApply = [...host.querySelectorAll("button")].find(button => button.textContent === "Apply")!;
    act(() => useGameStore.getState().step());
    act(() => oldApply.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(useGameStore.getState().engine.createRun().actions.filter(entry => entry.action.type === "REROUTE")).toHaveLength(0);
    expect(host.textContent).toContain("Recompute before applying");
    clickButton(host, "Retry");
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(host.textContent).toContain("Apply");
    act(() => useGameStore.getState().reset());
    expect(host.querySelector('[aria-label="Action review"]')).toBeNull();
    act(() => root.unmount());
  });

  it("ranks distinct alternative roads by strongest change and puts other horizons in details", async () => {
    vi.useFakeTimers();
    freePractice();
    const { host, root } = renderInspector();
    clickButton(host, "Preview Reroute");
    await act(async () => { await vi.runAllTimersAsync(); });
    const sample = useGameStore.getState().preview.result!.forecastChanges[0];
    act(() => useGameStore.setState(state => ({ preview: { ...state.preview, result: {
      ...state.preview.result!, passengerDelayDeltaMinutes: 12.5, passengerDelayDeltaPerPassenger: 0.25,
      forecastChanges: [
        { ...sample, edgeId: "small", before: 0.5, after: 0.52 },
        { ...sample, edgeId: "south_bridge", before: 0.2, after: 0.8 },
        { ...sample, edgeId: "south_bridge", before: 0.2, after: 0.7, actualHorizonMinutes: 10 },
        { ...sample, edgeId: "west_bypass", before: 0.7, after: 0.4 },
        { ...sample, edgeId: "north_feed", before: 0.5, after: 0.6 }
      ]
    } } })));
    const summary = host.querySelector('[aria-label="Other affected roads"]')!.textContent!;
    expect(summary.indexOf("South Bridge")).toBeLessThan(summary.indexOf("west bypass"));
    expect(summary.match(/South Bridge/g)).toHaveLength(1);
    expect(summary).not.toContain("small");
    expect(host.querySelector("details")!.textContent).toContain("small");
    expect(host.textContent).toContain("12.5 passenger-minutes (0.25 minutes per rider)");
    act(() => root.unmount());
  });

  it("tutorial uses the same review, Cancel recovers, and Apply precedes observation", async () => {
    vi.useFakeTimers();
    useGameStore.getState().replayTutorial();
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<><RoadInspector /><TutorialCoach /></>));
    clickButton(host, "Continue");
    clickButton(host, "Select North Bridge");
    clickButton(host, "Continue");
    act(() => host.querySelector(".actionChoice button")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    expect(useGameStore.getState().tutorial.step).toBe("preview");
    clickButton(host, "Preview Reroute");
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(useGameStore.getState().tutorial.step).toBe("review");
    expect(host.querySelectorAll('[aria-label="Action review"]')).toHaveLength(1);
    clickButton(host, "Cancel");
    expect(useGameStore.getState().tutorial.step).toBe("preview");
    clickButton(host, "Preview Reroute");
    await act(async () => { await vi.runAllTimersAsync(); });
    clickButton(host, "Apply");
    expect(useGameStore.getState().tutorial.step).toBe("observe");
    expect(useGameStore.getState().engine.createRun().actions.filter(entry => entry.action.type === "REROUTE")).toHaveLength(1);
    act(() => root.unmount());
  });

  it("practice and Monday results have truthful titles, metrics, and restart actions", () => {
    freePractice();
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<EndScreen />));
    expect(host.textContent).toContain(`${practiceScenario.name} Complete`);
    expect(host.textContent).toContain("Practice complete");
    expect(host.textContent).not.toContain("Improvement");
    clickButton(host, "Practice Again");
    expect(useGameStore.getState().tutorial.active).toBe(false);
    expect(useGameStore.getState().speed).toBe(1);
    expect(useGameStore.getState().preview.status).toBe("idle");
    clickButton(host, "Start Monday Morning");
    expect(host.textContent).toContain(`${mondayMorningScenario.name} Complete`);
    expect(host.textContent).toContain("higher is better");
    expect(host.textContent).toContain("lower is better");
    // Advance a real scenario to completion; verify the displayed unfinished counts.
    act(() => {
      const engine = useGameStore.getState().engine;
      // Exercise a real incomplete evaluation, not the now-removed 09:00 finish.
      const snapshot = engine.exportSnapshot(); snapshot.scenario.evaluation = { maxClearanceMinutes: .25 };
      engine.restoreFromSnapshot(snapshot);
      while (!engine.isDone()) engine.step();
      useGameStore.setState(state => ({ scenario: snapshot.scenario, version: state.version + 1 }));
    });
    const metrics = useGameStore.getState().engine.getState().metrics;
    expect(metrics.waitingTrips + metrics.activeTrips).toBeGreaterThan(0);
    expect(host.textContent).toContain(`Waiting unfinished trips${metrics.waitingTrips}`);
    expect(host.textContent).toContain(`Active unfinished trips${metrics.activeTrips}`);
    expect(host.textContent).toContain(`Of active trips: queued at road exits${metrics.inNetworkQueuedTrips}`);
    expect(host.textContent).toContain("not full-journey costs");
    expect(metrics.inNetworkQueuedTrips).toBeLessThanOrEqual(metrics.activeTrips);
    expect(metrics.tripsCompleted + metrics.waitingTrips + metrics.activeTrips).toBe(metrics.tripsRequested);
    expect(host.textContent).not.toMatch(/Best decision|Worst decision|Rating|optimal/i);
    clickButton(host, "Try This Seed Again");
    expect(useGameStore.getState().engine.isDone()).toBe(false);
    expect(useGameStore.getState().speed).toBe(1);
    act(() => root.unmount());
  });
});
