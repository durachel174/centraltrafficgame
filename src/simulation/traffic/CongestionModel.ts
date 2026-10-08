import type { RoadEdge } from "../network/types";

export interface CongestionConfig {
  alpha: number;
  beta: number;
}

export function effectiveCapacity(edge: RoadEdge): number {
  return Math.max(1, edge.comfortableCapacity * edge.capacityModifier);
}

export function utilization(edge: RoadEdge): number {
  return edge.closed ? Number.POSITIVE_INFINITY : edge.currentVehicleCount / effectiveCapacity(edge);
}

export function travelTime(edge: RoadEdge, config: CongestionConfig, vehicleCount = edge.currentVehicleCount): number {
  if (edge.closed) return Number.POSITIVE_INFINITY;
  const u = vehicleCount / effectiveCapacity(edge);
  return edge.baseTravelTime * (1 + config.alpha * Math.pow(Math.max(0, u), config.beta));
}
