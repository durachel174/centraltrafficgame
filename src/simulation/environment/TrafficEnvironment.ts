import { SimulationEngine } from "../core/SimulationEngine";
import type { Scenario, SimulationAction, SimulationInfo, SimulationObservation } from "../types";

export class TrafficEnvironment {
  private engine: SimulationEngine;

  constructor(scenario: Scenario) {
    this.engine = new SimulationEngine(scenario);
  }

  reset(seed?: number): SimulationObservation {
    return this.engine.reset(seed);
  }

  step(action: SimulationAction = { type: "NO_OP" }): {
    observation: SimulationObservation;
    reward: number;
    done: boolean;
    info: SimulationInfo;
  } {
    return this.engine.step(action);
  }

  getEngine() {
    return this.engine;
  }
}
