import type { SimulationAction, SimulationObservation } from "../types";
import type { TrafficController } from "./TrafficController";

export class ReactiveController implements TrafficController {
  private lastActionTime = -999;

  decide(observation: SimulationObservation): SimulationAction | null {
    if (observation.evaluation?.phase !== "decision") return null;
    if (observation.time - this.lastActionTime < 8) return null;
    const north = observation.edges.find((edge) => edge.id === "north_bridge");
    const south = observation.edges.find((edge) => edge.id === "south_bridge");
    if (north && south && north.utilization > 1.05 && south.utilization < 0.9) {
      this.lastActionTime = observation.time;
      return { type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.2 };
    }
    if ((observation.waitingTrips > 120 || (north?.utilization ?? 0) > 1.25) && observation.time - this.lastActionTime > 12) {
      this.lastActionTime = observation.time;
      return { type: "DELAY_DEPARTURES", destination: "downtown", durationMinutes: 5, percentage: 0.25 };
    }
    return null;
  }
}
