import { SimulationEngine } from "../core/SimulationEngine";
import type { Scenario, SimulationAction, SimulationRun } from "../types";
import { ENGINE_VERSION } from "./Identity";
import { parseRunFile, verifyCompletedRun, validateActionTiming } from "./RunFile";

export function actionForReplayTick(run: SimulationRun, intervalEnd: number): SimulationAction {
  return run.actions.find(entry => entry.simulationTime === intervalEnd)?.action ?? { type: "NO_OP" };
}

export function replayRun(scenario: Scenario, run: SimulationRun) {
  if (run.engineVersion !== ENGINE_VERSION || run.scenarioId !== scenario.id) throw new Error("Incompatible engine version or scenario for replay.");
  const completed = "schemaVersion" in run ? parseRunFile(JSON.stringify(run), scenario) : null;
  validateActionTiming(run.actions, scenario);
  const engine = new SimulationEngine(scenario);
  engine.reset(run.seed);
  while (!engine.isDone()) {
    engine.step(actionForReplayTick(run, engine.getState().time + engine.dtMinutes));
  }
  const error = completed ? verifyCompletedRun(engine, completed) : null;
  if (error) throw new Error(error);
  return engine.createRun();
}
