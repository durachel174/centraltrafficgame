import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import { calculateMetrics } from "../simulation/scoring/Metrics";
import { TrafficGraph } from "../simulation/network/TrafficGraph";

describe("separate terminal liability for player-imposed holds", () => {
  it("charges only remaining hold time, keeps observed delay separate, and cannot double-count", () => {
    const args = { vehicles: [], waitingTrips: [{ id: "t", origin: "north_res", destination: "downtown", requestedDepartureTime: 0, passengerTolerance: 10, heldUntil: 20 }],
      graph: new TrafficGraph(mondayMorningScenario.graph), congestionCost: 0, departureDelay: 7,
      weights: { travelTime: 0, congestion: 0, departureDelay: 2, dissatisfaction: 0, excessDistance: 0 },
      utilizationThreshold: 1, currentTime: 10, satisfaction: mondayMorningScenario.satisfaction };
    const before = calculateMetrics(args); expect(before.objective).toBe(14); expect(before.remainingHoldPassengerMinutes).toBe(0);
    const terminal = calculateMetrics({ ...args, chargeTerminalHolds: true });
    expect(terminal.departureDelay).toBe(7); expect(terminal.remainingHoldPassengerMinutes).toBe(10);
    expect(terminal.objectiveBreakdown!.terminalHoldDelay).toBe(20); expect(terminal.objective).toBe(34);
    expect(calculateMetrics({ ...args, chargeTerminalHolds: true })).toEqual(terminal);
    expect(calculateMetrics({ ...args, currentTime: 20, chargeTerminalHolds: true }).objectiveBreakdown!.terminalHoldDelay).toBe(0);
  });
  it("near-end previews expose committed future hold separately and match exact execution", () => {
    const scenario = { ...mondayMorningScenario, evaluation: undefined, endTime: 421, demand: { ...mondayMorningScenario.demand, curve: [{ minute: 0, tripsPerMinute: 0 }, { minute: 1, tripsPerMinute: 0 }] } };
    const engine = new SimulationEngine(scenario); engine.reset(4);
    const snapshot = engine.exportSnapshot(); snapshot.time = 0.75; snapshot.departureDelay = 0.75;
    snapshot.waiting = [{ id: "t", origin: "north_res", destination: "downtown", requestedDepartureTime: 0, passengerTolerance: 10, heldUntil: 2 }];
    engine.restoreFromSnapshot(snapshot);
    const action = { type: "DELAY_DEPARTURES" as const, percentage: 1, durationMinutes: 5 };
    const preview = engine.previewAction(action);
    const baseline = new SimulationEngine(scenario); baseline.restoreFromSnapshot(snapshot); baseline.step();
    engine.step(action);
    expect(preview.passengerDelayDeltaMinutes).toBe(0);
    expect(preview.terminalHoldDeltaPassengerMinutes).toBe(3.75);
    expect(preview.networkCostDelta).toBeCloseTo(engine.getState().metrics.objective - baseline.getState().metrics.objective);
    const final = engine.getState().metrics;
    expect(final.departureDelay).toBe(1); expect(final.remainingHoldPassengerMinutes).toBe(4.75);
    expect(Object.values(final.objectiveBreakdown!).reduce((sum, value) => sum + value, 0)).toBe(final.objective);
    engine.step(); expect(engine.getState().metrics).toEqual(final);
  });
});
