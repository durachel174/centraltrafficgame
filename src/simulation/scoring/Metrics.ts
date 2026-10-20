import { utilization } from "../traffic/CongestionModel";
import type { TrafficGraph } from "../network/TrafficGraph";
import type { ObjectiveWeights, SimulationMetrics, TripRequest, Vehicle } from "../types";

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};

export function calculateMetrics(args: {
  vehicles: Vehicle[];
  waitingTrips: TripRequest[];
  graph: TrafficGraph;
  congestionCost: number;
  departureDelay: number;
  weights: ObjectiveWeights;
  utilizationThreshold: number;
  currentTime: number;
  chargeTerminalHolds?: boolean;
  satisfaction: { departureDelay: number; lateDelay: number; reroute: number };
}): SimulationMetrics {
  const completed = args.vehicles.filter((vehicle) => vehicle.status === "arrived");
  const activeVehicles = args.vehicles.filter((vehicle) => vehicle.status === "traveling");
  const active = activeVehicles.length;
  const durations = completed.map((vehicle) => (vehicle.actualArrivalTime ?? 0) - (vehicle.actualDepartureTime ?? 0));
  const activeDurations = activeVehicles.map((vehicle) => args.currentTime - (vehicle.actualDepartureTime ?? args.currentTime));
  const travelTime = [...durations, ...activeDurations].reduce((sum, value) => sum + Math.max(0, value), 0);
  const averageTravelTime = durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length);
  const waitingSatisfaction = args.waitingTrips.map((trip) =>
    Math.max(0, 100 - Math.max(0, args.currentTime - trip.requestedDepartureTime) * args.satisfaction.departureDelay)
  );
  const activeSatisfaction = activeVehicles.map((vehicle) => {
    const elapsed = args.currentTime - (vehicle.actualDepartureTime ?? args.currentTime);
    const late = Math.max(0, elapsed - vehicle.passengerTolerance);
    return Math.max(0, vehicle.satisfaction - late * args.satisfaction.lateDelay);
  });
  const allSatisfaction = [
    ...completed.map((vehicle) => vehicle.satisfaction),
    ...activeSatisfaction,
    ...waitingSatisfaction
  ];
  const averageSatisfaction = allSatisfaction.length
    ? allSatisfaction.reduce((sum, value) => sum + value, 0) / allSatisfaction.length
    : 100;
  const routeDistance = (vehicle: Vehicle) => {
    if (vehicle.status === "arrived") return vehicle.distanceKm;
    return vehicle.route.reduce((sum, edgeId, index) => {
      if (vehicle.status === "traveling" && index < vehicle.currentEdgeIndex) return sum;
      if (vehicle.status === "traveling" && index === vehicle.currentEdgeIndex) {
        return sum + args.graph.edge(edgeId).lengthKm * (1 - vehicle.edgeProgress);
      }
      return sum + args.graph.edge(edgeId).lengthKm;
    }, vehicle.distanceKm);
  };
  const excessDistance = args.vehicles.reduce(
    (sum, vehicle) => sum + Math.max(0, routeDistance(vehicle) - vehicle.baselineDistanceKm),
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
  const dissatisfaction = allSatisfaction.reduce((sum, value) => sum + (100 - value), 0);
  const remainingHoldPassengerMinutes = args.chargeTerminalHolds
    ? args.waitingTrips.reduce((sum, trip) => sum + Math.max(0, (trip.heldUntil ?? args.currentTime) - args.currentTime), 0) : 0;
  const objectiveBreakdown = {
    travelTime: args.weights.travelTime * travelTime,
    congestion: args.weights.congestion * args.congestionCost,
    departureDelay: args.weights.departureDelay * args.departureDelay,
    dissatisfaction: args.weights.dissatisfaction * dissatisfaction,
    excessDistance: args.weights.excessDistance * excessDistance,
    terminalHoldDelay: args.weights.departureDelay * remainingHoldPassengerMinutes
  };
  const objective = Object.values(objectiveBreakdown).reduce((sum, value) => sum + value, 0);

  return {
    objectiveBreakdown,
    remainingHoldPassengerMinutes,
    tripsRequested: args.vehicles.length + args.waitingTrips.length,
    tripsCompleted: completed.length,
    activeTrips: active,
    waitingTrips: args.waitingTrips.length,
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


export const cloneMetrics = (metrics: SimulationMetrics): SimulationMetrics => ({
  ...metrics,
  ...(metrics.objectiveBreakdown ? { objectiveBreakdown: { ...metrics.objectiveBreakdown } } : {})
});
