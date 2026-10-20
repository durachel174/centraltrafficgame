import { SimulationEngine } from "../core/SimulationEngine";
import type { Scenario, SimulationAction, SimulationRun } from "../types";
import { validateActionTiming } from "./RunFile";

export function actionForReplayTick(run: SimulationRun, intervalEnd: number): SimulationAction {
  return run.actions.find(entry => entry.simulationTime === intervalEnd)?.action ?? { type: "NO_OP" };
}

export function replayRun(scenario: Scenario, run: SimulationRun) {
  validateActionTiming(run.actions, scenario);
  const engine = new SimulationEngine(scenario);
  engine.reset(run.seed);
  while (!engine.isDone()) {
    engine.step(actionForReplayTick(run, engine.getState().time + engine.dtMinutes));
  }
  return engine.createRun();
}
