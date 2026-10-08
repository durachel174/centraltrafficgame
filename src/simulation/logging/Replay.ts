import { SimulationEngine } from "../core/SimulationEngine";
import type { Scenario, SimulationRun } from "../types";

export function replayRun(scenario: Scenario, run: SimulationRun) {
  const engine = new SimulationEngine(scenario);
  engine.reset(run.seed);
  const actions = [...run.actions].sort((a, b) => a.simulationTime - b.simulationTime);
  let index = 0;
  while (!engine.isDone()) {
    const next = actions[index];
    const currentTime = engine.getState().time + engine.dtMinutes;
    const action = next && Math.abs(next.simulationTime - currentTime) < 0.001 ? next.action : { type: "NO_OP" as const };
    engine.step(action);
    if (action !== (undefined as never) && next && Math.abs(next.simulationTime - currentTime) < 0.001) index += 1;
  }
  return engine.createRun();
}
