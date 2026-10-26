import type { GraphConfig } from "./network/types";
import type { RoadEdge, TrafficNode } from "./network/types";

export interface EvaluationState {
  phase: "decision" | "clearance" | "finished";
  decisionCutoff: number;
  elapsedClearanceMinutes: number;
  maxClearanceMinutes: number;
  evaluationLimit: number;
  finishReason: "all-arrived" | "safety-limit" | "decision-window-ended" | null;
  finishedAt: number | null;
}

export interface Vehicle {
  groupId?: string;
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
  groupId?: string;
  availableAt?: number;
  groupDecided?: boolean;
  assignedCorridor?: string;
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

export interface ObjectiveBreakdown {
  terminalHoldDelay: number;
  travelTime: number;
  congestion: number;
  departureDelay: number;
  dissatisfaction: number;
  excessDistance: number;
}

export interface SimulationMetrics {
  remainingHoldPassengerMinutes?: number;
  objectiveBreakdown?: ObjectiveBreakdown;
  tripsRequested: number;
  tripsCompleted: number;
  activeTrips: number;
  /** Subset of active trips stopped at an edge exit awaiting admission. */
  inNetworkQueuedTrips: number;
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
  samples: ForecastSample[];
  congestionRisk: number;
}

export interface TrafficAlert {
  id: string;
  edgeId: string;
  title: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  minutesUntil: number;
  requestedMinutesUntil: number;
  truncated: boolean;
  current: number;
  predicted: number;
}

export type SimulationAction =
  | { type: "ROUTE_GROUP"; groupId: string; corridorId: string }
  | { type: "HOLD_GROUP"; groupId: string; durationMinutes: number }
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
  requestedHorizonMinutes: number;
  actualHorizonMinutes: number;
  truncated: boolean;
  before: number;
  after: number;
}

export interface ForecastSample {
  requestedHorizonMinutes: number;
  actualHorizonMinutes: number;
  truncated: boolean;
  utilization: number;
}

export interface ActionPreview {
  includesClearance?: boolean;
  baselineHorizonMinutes?: number;
  actionHorizonMinutes?: number;
  terminalHoldDeltaPassengerMinutes?: number;
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
  version: 3;
  decisionCutoffMetrics: SimulationMetrics | null;
  engineVersion: string;
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

export interface DepartureBatch { id: string; label: string; at: number; size: number; origin: string; destination: string; decisionMinutes: number }

export interface DemandConfig {
  batches?: DepartureBatch[];
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
  departureGroups?: { version: 1; corridors: { id: string; label: string; viaEdge: string }[]; arrivalDeadline: number };
  /** endTime remains the decision/demand cutoff. Omit for fixed-window practice/fixtures. */
  evaluation?: { maxClearanceMinutes: number };
  version?: number;
  progression?: { rushHourMinute: number };
  terminalHoldAccounting?: boolean;
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
  evaluation: EvaluationState;
  time: number;
  edges: EdgeObservation[];
  demand: DemandObservation[];
  activeTrips: number;
  waitingTrips: number;
  metrics: SimulationMetrics;
}

export interface SimulationInfo {
  evaluation: EvaluationState;
  actionRejected?: string;
  alerts: TrafficAlert[];
  forecasts: TrafficForecast[];
}

export interface LoggedAction {
  simulationTime: number;
  stateSnapshotId: string;
  action: SimulationAction;
  immediateReward: number;
  affectedCount?: number;
}

export interface SimulationRun {
  evaluation?: EvaluationState;
  decisionCutoffMetrics?: SimulationMetrics | null;
  scenarioId: string;
  seed: number;
  engineVersion: string;
  startedAt: string;
  actions: LoggedAction[];
  finalMetrics?: SimulationMetrics;
}
