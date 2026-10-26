import { SimulationEngine } from "../core/SimulationEngine";
import type { Scenario, SimulationAction, SimulationRun } from "../types";
import { engineVersionFor } from "./Identity";
import { parseRunFile, verifyCompletedRun, validateActionTiming } from "./RunFile";

export function actionForReplayTick(run: SimulationRun, intervalEnd: number): SimulationAction {
  return run.actions.find(entry => entry.simulationTime === intervalEnd)?.action ?? { type: "NO_OP" };
}

export function replayRun(scenario: Scenario, run: SimulationRun) {
  if (run.engineVersion !== engineVersionFor(scenario) || run.scenarioId !== scenario.id) throw new Error("Incompatible engine version or scenario for replay.");
  const completed = "schemaVersion" in run ? parseRunFile(JSON.stringify(run), scenario) : null;
  validateActionTiming(run.actions, scenario);
  const engine = new SimulationEngine(scenario, undefined, true);
  engine.reset(run.seed);
  while (!engine.isDone()) {
    const result = engine.step(actionForReplayTick(run, engine.getState().time + engine.dtMinutes));
    if (result.info.actionRejected) throw Error(`Replay action rejected: ${result.info.actionRejected}`);
  }
  const error = completed ? verifyCompletedRun(engine, completed) : null;
  if (error) throw new Error(error);
  return engine.createRun();
}
