import { describe, expect, it } from "vitest";
import { PerformanceRecorder, distribution } from "../performance/Recorder";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";

describe("bounded opt-in local performance capture", () => {
  it("records nothing when disabled and bounds every metric while preserving total counts", () => {
    const recorder = new PerformanceRecorder(3);
    recorder.record("tick", 5); expect(recorder.report(0).metrics).toEqual({});
    recorder.start("fixture", 0);
    for (let value = 1; value <= 10; value++) recorder.record("tick", value);
    expect(recorder.report(20).metrics.tick).toEqual({ count: 3, totalSeen: 10, median: 9, p95: 10, maximum: 10 });
    recorder.recording = false; recorder.record("tick", 99);
    expect(recorder.report(20).metrics.tick.maximum).toBe(10);
    expect(distribution([1, 2, 3, 4])).toEqual({ count: 4, median: 2.5, p95: 4, maximum: 4 });
  });
  it("instrumentation never changes state, actions, rewards, or random future demand", () => {
    const recorder = new PerformanceRecorder(); recorder.start("fixture", 0);
    const clean = new SimulationEngine(mondayMorningScenario);
    const measured = new SimulationEngine(mondayMorningScenario, recorder.record);
    clean.reset(51); measured.reset(51);
    for (let tick = 0; tick < 40; tick++) {
      const action = tick === 20 ? { type: "REROUTE" as const, targetEdge: "north_bridge", percentage: 0.25 } : { type: "NO_OP" as const };
      expect(measured.step(action)).toEqual(clean.step(action));
    }
    expect(measured.exportSnapshot()).toEqual(clean.exportSnapshot());
    expect(recorder.report(20).metrics.tick.count).toBe(40);
  });
});
