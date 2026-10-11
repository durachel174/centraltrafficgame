import type { GraphConfig } from "./network/types";
import type { RoadEdge, TrafficNode } from "./network/types";

export interface Vehicle {
  id: string;
  origin: string;
  destination: string;
  route: string[];
  currentEdgeIndex: number;
  edgeProgress: number;
  requestedDepartureTime: number;
  actualDepartureTime?: number;
  expectedArrivalTime?: number;
  actualArrivalTime?: number;
  baselineTravelTime: number;
  baselineDistanceKm: number;
  status: "waiting" | "traveling" | "arrived";
  passengerTolerance: number;
  satisfaction: number;
  rerouteCount: number;
  distanceKm: number;
}

export interface TripRequest {
  id: string;
  origin: string;
  destination: string;
  requestedDepartureTime: number;
  passengerTolerance: number;
  heldUntil?: number;
}

export interface ObjectiveWeights {
  travelTime: number;
  congestion: number;
  departureDelay: number;
  dissatisfaction: number;
  excessDistance: number;
}

export interface SimulationMetrics {
  tripsRequested: number;
  tripsCompleted: number;
  activeTrips: number;
  waitingTrips: number;
  averageTravelTime: number;
  medianTripTime: number;
  p90TripTime: number;
  p95TripTime: number;
  maxTripTime: number;
  averageSatisfaction: number;
  congestionCost: number;
  departureDelay: number;
  excessDistance: number;
  objective: number;
  flow: number;
  worstBottleneck?: string;
}

export interface TrafficForecast {
  edgeId: string;
  currentUtilization: number;
  utilization5m: number;
  utilization10m: number;
  utilization15m: number;
  congestionRisk: number;
}

export interface TrafficAlert {
  id: string;
  edgeId: string;
  title: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  minutesUntil: number;
  current: number;
  predicted: number;
}

export type SimulationAction =
  | { type: "NO_OP" }
  | { type: "REROUTE"; targetEdge: string; percentage: number; avoidEdge?: string }
  | { type: "DELAY_DEPARTURES"; destination?: string; origin?: string; targetEdge?: string; durationMinutes: number; percentage: number }
  | { type: "RELEASE_DEPARTURES"; destination?: string; origin?: string; targetEdge?: string }
  | { type: "DEBUG_SPAWN"; count: number }
  | { type: "DEBUG_INCIDENT"; edgeId: string; capacityModifier: number; durationMinutes: number }
  | { type: "DEBUG_CLEAR_INCIDENT"; edgeId: string };

export type DisruptionAction =
  | { type: "DEMAND_SURGE"; cost: number; duration: number; multiplier: number }
  | { type: "CAPACITY_REDUCTION"; cost: number; duration: number; edgeId: string; capacityModifier: number }
  | { type: "ROAD_CLOSURE"; cost: number; duration: number; edgeId: string };

export interface ForecastDelta {
  edgeId: string;
  horizonMinutes: number;
  before: number;
  after: number;
}

export interface ActionPreview {
  affectedVehicles: number;
  networkCostDelta: number;
  forecastChanges: ForecastDelta[];
  passengerDelayDeltaMinutes: number;
  passengerDelayDeltaPerPassenger: number;
  satisfactionDelta: number;
  horizonMinutes: number;
  requestedHorizonMinutes: number;
  truncated: boolean;
}

export interface GraphSnapshot {
  nodes: TrafficNode[];
  edges: RoadEdge[];
}

export interface SimulationSnapshot {
  version: 1;
  scenario: Scenario;
  seed: number;
  time: number;
  graph: GraphSnapshot;
  rngState: number;
  demandState: { carry: number; nextId: number };
  waiting: TripRequest[];
  vehicles: Vehicle[];
  congestionCost: number;
  departureDelay: number;
  previousObjective: number;
  latestReward: number;
  latestActionAffected: number;
  actionLog: LoggedAction[];
  activeEventIds: string[];
  temporaryReductions: Array<[string, { until: number; modifier: number }]>;
  metrics: SimulationMetrics;
  forecasts: TrafficForecast[];
  alerts: TrafficAlert[];
  lastForecastTime: number;
  forecastingEnabled: boolean;
}

export interface DemandPair {
  origin: string;
  destination: string;
  weight: number;
}

export interface DemandPoint {
  minute: number;
  tripsPerMinute: number;
}

export interface DemandConfig {
  curve: DemandPoint[];
  pairs: DemandPair[];
  passengerTolerance: [number, number];
}

export interface ScenarioEvent {
  id: string;
  time: number;
  duration: number;
  type: "CAPACITY_REDUCTION";
  edgeId: string;
  capacityModifier: number;
  title: string;
}

export interface Scenario {
  id: string;
  name: string;
  seed?: number;
  startTime: number;
  endTime: number;
  graph: GraphConfig;
  demand: DemandConfig;
  events: ScenarioEvent[];
  objectiveWeights: ObjectiveWeights;
  congestion: { alpha: number; beta: number; utilizationThreshold: number };
  satisfaction: { departureDelay: number; lateDelay: number; reroute: number };
  forecast?: {
    horizonsMinutes: [number, number, number];
    refreshIntervalMinutes: number;
    warningUtilization: number;
    criticalUtilization: number;
    previewHorizonMinutes: number;
  };
}

export interface EdgeObservation {
  id: string;
  utilization: number;
  currentTravelTime: number;
  vehicleCount: number;
  capacityModifier: number;
  closed: boolean;
}

export interface DemandObservation {
  origin: string;
  destination: string;
  waiting: number;
}

export interface SimulationObservation {
  time: number;
  edges: EdgeObservation[];
  demand: DemandObservation[];
  activeTrips: number;
  waitingTrips: number;
  metrics: SimulationMetrics;
}

export interface SimulationInfo {
  alerts: TrafficAlert[];
  forecasts: TrafficForecast[];
}

export interface LoggedAction {
  simulationTime: number;
  stateSnapshotId: string;
  action: SimulationAction;
  immediateReward: number;
}

export interface SimulationRun {
  scenarioId: string;
  seed: number;
  engineVersion: string;
  startedAt: string;
  actions: LoggedAction[];
  finalMetrics?: SimulationMetrics;
}
