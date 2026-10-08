import { effectiveCapacity, utilization } from "../traffic/CongestionModel";
import type { TrafficGraph } from "../network/TrafficGraph";
import type { TrafficForecast, Vehicle } from "../types";

export function forecastTraffic(graph: TrafficGraph, vehicles: Vehicle[], waitingTrips: number): TrafficForecast[] {
  const pressure = waitingTrips * 0.08;
  return Array.from(graph.edges.values())
    .filter((edge) => edge.major)
    .map((edge) => {
      const current = utilization(edge);
      const inbound = vehicles.filter((vehicle) => vehicle.route.slice(vehicle.currentEdgeIndex).includes(edge.id)).length;
      const capacity = effectiveCapacity(edge);
      const projected = current + inbound / Math.max(1, capacity) * 0.35 + pressure / Math.max(1, capacity);
      const f5 = Math.max(current, projected * 0.75);
      const f10 = Math.max(f5, projected);
      const f15 = Math.max(f10, projected * 1.08);
      return {
        edgeId: edge.id,
        currentUtilization: current,
        utilization5m: f5,
        utilization10m: f10,
        utilization15m: f15,
        congestionRisk: Math.min(1, Math.max(f5, f10, f15) / 1.25)
      };
    });
}

export function createAlerts(forecasts: TrafficForecast[]) {
  return forecasts
    .filter((forecast) => forecast.utilization10m > 1 || forecast.utilization15m > 1.08)
    .map((forecast) => {
      const predicted = Math.max(forecast.utilization5m, forecast.utilization10m, forecast.utilization15m);
      return {
        id: `alert_${forecast.edgeId}`,
        edgeId: forecast.edgeId,
        title: predicted > 1.25 ? "Critical congestion predicted" : "Congestion predicted",
        severity: predicted > 1.25 ? ("CRITICAL" as const) : ("WARNING" as const),
        minutesUntil: forecast.utilization5m > 1 ? 5 : forecast.utilization10m > 1 ? 10 : 15,
        current: forecast.currentUtilization,
        predicted
      };
    });
}
