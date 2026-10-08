import { utilization } from "../traffic/CongestionModel";
import type { TrafficGraph } from "../network/TrafficGraph";
import type { ObjectiveWeights, SimulationMetrics, Vehicle } from "../types";

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};

export function calculateMetrics(args: {
  vehicles: Vehicle[];
  waitingTrips: number;
  graph: TrafficGraph;
  congestionCost: number;
  departureDelay: number;
  weights: ObjectiveWeights;
  utilizationThreshold: number;
}): SimulationMetrics {
  const completed = args.vehicles.filter((vehicle) => vehicle.status === "arrived");
  const active = args.vehicles.filter((vehicle) => vehicle.status === "traveling").length;
  const durations = completed.map((vehicle) => (vehicle.actualArrivalTime ?? 0) - (vehicle.actualDepartureTime ?? 0));
  const averageTravelTime = durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length);
  const averageSatisfaction =
    completed.reduce((sum, vehicle) => sum + vehicle.satisfaction, 0) / Math.max(1, completed.length || args.vehicles.length);
  const excessDistance = completed.reduce(
    (sum, vehicle) => sum + Math.max(0, vehicle.distanceKm - vehicle.baselineTravelTime),
    0
  );
  let worstBottleneck = "";
  let worstUtilization = 0;
  for (const edge of args.graph.edges.values()) {
    const value = utilization(edge);
    if (Number.isFinite(value) && value > worstUtilization) {
      worstUtilization = value;
      worstBottleneck = edge.name ?? edge.id;
    }
  }
  const dissatisfaction = completed.reduce((sum, vehicle) => sum + (100 - vehicle.satisfaction), 0);
  const travelTime = durations.reduce((sum, value) => sum + value, 0);
  const objective =
    args.weights.travelTime * travelTime +
    args.weights.congestion * args.congestionCost +
    args.weights.departureDelay * args.departureDelay +
    args.weights.dissatisfaction * dissatisfaction +
    args.weights.excessDistance * excessDistance;

  return {
    tripsRequested: args.vehicles.length + args.waitingTrips,
    tripsCompleted: completed.length,
    activeTrips: active,
    waitingTrips: args.waitingTrips,
    averageTravelTime,
    medianTripTime: percentile(durations, 0.5),
    p90TripTime: percentile(durations, 0.9),
    p95TripTime: percentile(durations, 0.95),
    maxTripTime: durations.length ? Math.max(...durations) : 0,
    averageSatisfaction,
    congestionCost: args.congestionCost,
    departureDelay: args.departureDelay,
    excessDistance,
    objective,
    flow: Math.max(0, 100 - Math.max(0, worstUtilization - args.utilizationThreshold) * 80),
    worstBottleneck
  };
}
