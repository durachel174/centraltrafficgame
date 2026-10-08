import type { SimulationAction, SimulationObservation } from "../types";

export interface TrafficController {
  decide(observation: SimulationObservation): SimulationAction | null;
}
