import { SeededRandom } from "./SeededRandom";
import { TrafficGraph } from "../network/TrafficGraph";
import { Router, type RoutingContext } from "../network/Router";
import { travelTime, utilization } from "../traffic/CongestionModel";
import { DemandGenerator } from "../traffic/DemandGenerator";
import { calculateMetrics } from "../scoring/Metrics";
import { createAlerts } from "../forecasting/TrafficPredictor";
import type {
  ActionPreview,
  EdgeObservation,
  LoggedAction,
  Scenario,
  SimulationAction,
  SimulationMetrics,
  SimulationObservation,
  SimulationRun,
  TrafficAlert,
  TrafficForecast,
  TripRequest,
  Vehicle
} from "../types";

export class SimulationEngine {
  readonly dtMinutes = 0.25;
  graph: TrafficGraph;
  router: Router;
  rng: SeededRandom;
  private demand: DemandGenerator;
  private seed = 1;
  private time = 0;
  private waiting: TripRequest[] = [];
  private vehicles: Vehicle[] = [];
  private congestionCost = 0;
  private departureDelay = 0;
  private previousObjective = 0;
  private latestReward = 0;
  private actionLog: LoggedAction[] = [];
  private activeEventIds = new Set<string>();
  private temporaryReductions = new Map<string, { until: number; modifier: number }>();
  private metrics: SimulationMetrics;
  private forecastingEnabled = true;
  private lastForecastTime = Number.NEGATIVE_INFINITY;
  forecasts: TrafficForecast[] = [];
  alerts: TrafficAlert[] = [];

  constructor(private scenario: Scenario) {
    this.graph = new TrafficGraph(scenario.graph);
    this.rng = new SeededRandom(scenario.seed ?? 1);
    this.router = new Router(this.graph, scenario.congestion);
    this.demand = new DemandGenerator(scenario.demand, this.rng);
    this.metrics = this.emptyMetrics();
  }

  reset(seed = this.scenario.seed ?? 1): SimulationObservation {
    this.seed = seed;
    this.time = 0;
    this.waiting = [];
    this.vehicles = [];
    this.congestionCost = 0;
    this.departureDelay = 0;
    this.previousObjective = 0;
    this.latestReward = 0;
    this.actionLog = [];
    this.activeEventIds.clear();
    this.temporaryReductions.clear();
    this.graph = new TrafficGraph(this.scenario.graph);
    this.router = new Router(this.graph, this.scenario.congestion);
    this.rng = new SeededRandom(seed);
    this.demand = new DemandGenerator(this.scenario.demand, this.rng);
    this.metrics = this.emptyMetrics();
    this.updateDerived();
    return this.getObservation();
  }

  step(action: SimulationAction = { type: "NO_OP" }) {
    if (this.isDone()) {
      return { observation: this.getObservation(), reward: 0, done: true, info: this.getInfo() };
    }
    const before = this.metrics.objective;
    this.time += this.dtMinutes;
    this.processEvents();
    this.restoreTemporaryReductions();
    this.departureDelay += this.waiting.length * this.dtMinutes;
    this.waiting.push(...this.demand.generate(this.time, this.dtMinutes));
    this.applyAction(action);
    if (action.type !== "NO_OP") this.lastForecastTime = Number.NEGATIVE_INFINITY;
    this.dispatchTrips();
    this.updateEdgeCounts();
    this.updateTravelTimes();
    this.moveVehicles();
    this.updateEdgeCounts();
    this.updateDerived();
    const reward = before - this.metrics.objective;
    this.latestReward = reward;
    if (action.type !== "NO_OP") {
      this.actionLog.push({
        simulationTime: this.time,
        stateSnapshotId: `t_${this.time.toFixed(2)}`,
        action,
        immediateReward: reward
      });
    }
    this.previousObjective = this.metrics.objective;
    return { observation: this.getObservation(), reward, done: this.isDone(), info: this.getInfo() };
  }

  getState() {
    return {
      time: this.time,
      graph: this.graph.clone(),
      waiting: this.waiting.map((trip) => ({ ...trip })),
      vehicles: this.vehicles.map((vehicle) => ({ ...vehicle, route: [...vehicle.route] })),
      metrics: { ...this.metrics },
      forecasts: this.forecasts.map((forecast) => ({ ...forecast })),
      alerts: this.alerts.map((alert) => ({ ...alert }))
    };
  }

  getReward() {
    return this.latestReward;
  }

  getObservation(): SimulationObservation {
    const demand = new Map<string, number>();
    for (const trip of this.waiting) {
      const key = `${trip.origin}->${trip.destination}`;
      demand.set(key, (demand.get(key) ?? 0) + 1);
    }
    return {
      time: this.scenario.startTime + this.time,
      edges: Array.from(this.graph.edges.values()).map<EdgeObservation>((edge) => ({
        id: edge.id,
        utilization: utilization(edge),
        currentTravelTime: edge.currentTravelTime,
        vehicleCount: edge.currentVehicleCount,
        capacityModifier: edge.capacityModifier,
        closed: edge.closed
      })),
      demand: Array.from(demand.entries()).map(([key, waiting]) => {
        const [origin, destination] = key.split("->");
        return { origin, destination, waiting };
      }),
      activeTrips: this.vehicles.filter((vehicle) => vehicle.status === "traveling").length,
      waitingTrips: this.waiting.length,
      metrics: { ...this.metrics }
    };
  }

  getInfo() {
    return {
      alerts: this.alerts.map((alert) => ({ ...alert })),
      forecasts: this.forecasts.map((forecast) => ({ ...forecast }))
    };
  }

  isDone() {
    return this.time >= this.scenario.endTime - this.scenario.startTime;
  }

  previewAction(action: SimulationAction): ActionPreview {
    const affectedVehicles = this.countAffected(action);
    const horizon = this.scenario.forecast?.previewHorizonMinutes ?? 15;
    const noAction = this.cloneForRollout();
    const withAction = this.cloneForRollout();
    noAction.runFor(horizon);
    withAction.step(action);
    withAction.runFor(Math.max(0, horizon - withAction.dtMinutes));
    const before = noAction.getState().metrics;
    const after = withAction.getState().metrics;
    const noActionForecast = noAction.computeForecastsFromCurrent();
    const actionForecast = withAction.computeForecastsFromCurrent();
    const forecastChanges = actionForecast.map((forecast) => {
      const baseline = noActionForecast.find((item) => item.edgeId === forecast.edgeId);
      return {
        edgeId: forecast.edgeId,
        before: baseline?.utilization10m ?? 0,
        after: forecast.utilization10m
      };
    });
    return {
      affectedVehicles,
      networkCostDelta: after.objective - before.objective,
      forecastChanges,
      averagePassengerDelayDelta: after.departureDelay - before.departureDelay,
      satisfactionDelta: after.averageSatisfaction - before.averageSatisfaction
    };
  }

  createRun(): SimulationRun {
    return {
      scenarioId: this.scenario.id,
      seed: this.seed,
      engineVersion: "0.1.0",
      startedAt: new Date(0).toISOString(),
      actions: [...this.actionLog],
      finalMetrics: { ...this.metrics }
    };
  }

  private processEvents() {
    for (const event of this.scenario.events) {
      const edge = this.graph.edge(event.edgeId);
      const active = this.time >= event.time && this.time < event.time + event.duration;
      if (active && !this.activeEventIds.has(event.id)) {
        edge.capacityModifier = event.capacityModifier;
        this.activeEventIds.add(event.id);
      } else if (!active && this.activeEventIds.has(event.id)) {
        edge.capacityModifier = 1;
        this.activeEventIds.delete(event.id);
      }
    }
  }

  private restoreTemporaryReductions() {
    for (const [edgeId, reduction] of this.temporaryReductions) {
      if (this.time >= reduction.until) {
        this.graph.edge(edgeId).capacityModifier = 1;
        this.temporaryReductions.delete(edgeId);
      }
    }
  }

  private applyAction(action: SimulationAction) {
    if (action.type === "NO_OP") return;
    if (action.type === "REROUTE") this.reroute(action.targetEdge, action.percentage, action.avoidEdge ?? action.targetEdge);
    if (action.type === "DELAY_DEPARTURES") {
      const trips = this.matchingTrips(action);
      const count = Math.floor(trips.length * action.percentage);
      for (const trip of trips.slice(0, count)) trip.heldUntil = Math.max(trip.heldUntil ?? 0, this.time + action.durationMinutes);
    }
    if (action.type === "RELEASE_DEPARTURES") {
      for (const trip of this.matchingTrips(action)) trip.heldUntil = undefined;
    }
    if (action.type === "DEBUG_SPAWN") this.spawnDebug(action.count);
    if (action.type === "DEBUG_INCIDENT") {
      this.graph.edge(action.edgeId).capacityModifier = action.capacityModifier;
      this.temporaryReductions.set(action.edgeId, { until: this.time + action.durationMinutes, modifier: action.capacityModifier });
    }
    if (action.type === "DEBUG_CLEAR_INCIDENT") {
      this.graph.edge(action.edgeId).capacityModifier = 1;
      this.temporaryReductions.delete(action.edgeId);
    }
  }

  private matchingTrips(filter: { origin?: string; destination?: string }) {
    return this.waiting.filter(
      (trip) => (!filter.origin || trip.origin === filter.origin) && (!filter.destination || trip.destination === filter.destination)
    );
  }

  private reroute(targetEdge: string, percentage: number, avoidEdge: string) {
    const candidates = this.vehicles.filter(
      (vehicle) => vehicle.status === "traveling" && vehicle.route.slice(vehicle.currentEdgeIndex + 1).includes(targetEdge)
    );
    const count = Math.floor(candidates.length * percentage);
    for (const vehicle of candidates.slice(0, count)) {
      const currentEdge = this.graph.edge(vehicle.route[vehicle.currentEdgeIndex]);
      const from = currentEdge.to;
      const route = this.router.findRoute(from, vehicle.destination, { avoidEdges: [avoidEdge] });
      if (route.length) {
        vehicle.route = [...vehicle.route.slice(0, vehicle.currentEdgeIndex + 1), ...route];
        vehicle.rerouteCount += 1;
        vehicle.satisfaction = Math.max(0, vehicle.satisfaction - this.scenario.satisfaction.reroute);
      }
    }
  }

  private dispatchTrips() {
    const remaining: TripRequest[] = [];
    for (const trip of this.waiting) {
      if ((trip.heldUntil ?? -1) > this.time) {
        remaining.push(trip);
        continue;
      }
      const context: RoutingContext = {};
      const route = this.router.findRoute(trip.origin, trip.destination, context);
      if (!route.length) {
        remaining.push(trip);
        continue;
      }
      const baselineRoute = this.router.findRoute(trip.origin, trip.destination, { weight: "baseTravelTime" });
      const baselineTravelTime = (baselineRoute.length ? baselineRoute : route).reduce(
        (sum, edgeId) => sum + this.graph.edge(edgeId).baseTravelTime,
        0
      );
      const baselineDistanceKm = (baselineRoute.length ? baselineRoute : route).reduce(
        (sum, edgeId) => sum + this.graph.edge(edgeId).lengthKm,
        0
      );
      const delay = Math.max(0, this.time - trip.requestedDepartureTime);
      const vehicle: Vehicle = {
        id: trip.id.replace("trip", "veh"),
        origin: trip.origin,
        destination: trip.destination,
        route,
        currentEdgeIndex: 0,
        edgeProgress: 0,
        requestedDepartureTime: trip.requestedDepartureTime,
        actualDepartureTime: this.time,
        baselineTravelTime,
        baselineDistanceKm,
        status: "traveling",
        passengerTolerance: trip.passengerTolerance,
        satisfaction: Math.max(0, 100 - delay * this.scenario.satisfaction.departureDelay),
        rerouteCount: 0,
        distanceKm: 0
      };
      this.vehicles.push(vehicle);
    }
    this.waiting = remaining;
  }

  private updateEdgeCounts() {
    this.graph.resetCounts();
    for (const vehicle of this.vehicles) {
      if (vehicle.status !== "traveling") continue;
      const edge = this.graph.edge(vehicle.route[vehicle.currentEdgeIndex]);
      edge.currentVehicleCount += 1;
    }
  }

  private updateTravelTimes() {
    for (const edge of this.graph.edges.values()) edge.currentTravelTime = travelTime(edge, this.scenario.congestion);
  }

  private moveVehicles() {
    const intervalStart = this.time - this.dtMinutes;
    for (const vehicle of this.vehicles) {
      if (vehicle.status !== "traveling") continue;
      let remaining = this.dtMinutes;
      while (remaining > 0 && vehicle.status === "traveling") {
        const edge = this.graph.edge(vehicle.route[vehicle.currentEdgeIndex]);
        const edgeTime = Math.max(0.01, edge.currentTravelTime);
        const edgeRemaining = (1 - vehicle.edgeProgress) * edgeTime;
        if (remaining >= edgeRemaining) {
          remaining -= edgeRemaining;
          vehicle.distanceKm += edge.lengthKm * (1 - vehicle.edgeProgress);
          vehicle.currentEdgeIndex += 1;
          vehicle.edgeProgress = 0;
          if (vehicle.currentEdgeIndex >= vehicle.route.length) {
            vehicle.status = "arrived";
            vehicle.actualArrivalTime = intervalStart + (this.dtMinutes - remaining);
            const tripTime = vehicle.actualArrivalTime - (vehicle.actualDepartureTime ?? vehicle.actualArrivalTime);
            const late = Math.max(0, tripTime - vehicle.passengerTolerance);
            vehicle.satisfaction = Math.max(0, vehicle.satisfaction - late * this.scenario.satisfaction.lateDelay);
          }
        } else {
          vehicle.edgeProgress += remaining / edgeTime;
          vehicle.distanceKm += edge.lengthKm * (remaining / edgeTime);
          remaining = 0;
        }
      }
    }
  }

  private updateDerived() {
    for (const edge of this.graph.edges.values()) {
      const over = Math.max(0, utilization(edge) - this.scenario.congestion.utilizationThreshold);
      if (Number.isFinite(over)) this.congestionCost += over * over * this.dtMinutes;
    }
    this.metrics = calculateMetrics({
      vehicles: this.vehicles,
      waitingTrips: this.waiting,
      graph: this.graph,
      congestionCost: this.congestionCost,
      departureDelay: this.departureDelay,
      weights: this.scenario.objectiveWeights,
      utilizationThreshold: this.scenario.congestion.utilizationThreshold,
      currentTime: this.time,
      satisfaction: this.scenario.satisfaction
    });
    if (this.forecastingEnabled && this.time - this.lastForecastTime >= (this.scenario.forecast?.refreshIntervalMinutes ?? 1)) {
      this.forecasts = this.computeForecastsFromCurrent();
      this.alerts = createAlerts(this.forecasts, {
        warningUtilization: this.scenario.forecast?.warningUtilization ?? 1,
        criticalUtilization: this.scenario.forecast?.criticalUtilization ?? 1.25
      });
      this.lastForecastTime = this.time;
    }
  }

  private spawnDebug(count: number) {
    for (let i = 0; i < count; i++) {
      const pair = this.rng.pickWeighted(this.scenario.demand.pairs.map((item) => ({ item, weight: item.weight })));
      this.waiting.push({
        id: `debug_${this.time}_${i}_${this.rng.int(999999)}`,
        origin: pair.origin,
        destination: pair.destination,
        requestedDepartureTime: this.time,
        passengerTolerance: 20
      });
    }
  }

  private countAffected(action: SimulationAction) {
    if (action.type === "REROUTE") {
      const candidates = this.vehicles.filter(
        (vehicle) =>
          vehicle.status === "traveling" && vehicle.route.slice(vehicle.currentEdgeIndex + 1).includes(action.targetEdge)
      );
      return Math.floor(candidates.length * action.percentage);
    }
    if (action.type === "DELAY_DEPARTURES") return Math.floor(this.matchingTrips(action).length * action.percentage);
    if (action.type === "RELEASE_DEPARTURES") return this.matchingTrips(action).filter((trip) => trip.heldUntil !== undefined).length;
    if (action.type === "DEBUG_SPAWN") return action.count;
    return 0;
  }

  private runFor(minutes: number) {
    const ticks = Math.round(minutes / this.dtMinutes);
    for (let i = 0; i < ticks && !this.isDone(); i++) this.step({ type: "NO_OP" });
  }

  private cloneForRollout() {
    const clone = new SimulationEngine(this.scenario);
    clone.restoreSnapshot(this.createSnapshot());
    clone.forecastingEnabled = false;
    return clone;
  }

  private createSnapshot() {
    return {
      seed: this.seed,
      time: this.time,
      graph: this.graph.clone(),
      rngState: this.rng.getState(),
      demandState: this.demand.getState(),
      waiting: this.waiting.map((trip) => ({ ...trip })),
      vehicles: this.vehicles.map((vehicle) => ({ ...vehicle, route: [...vehicle.route] })),
      congestionCost: this.congestionCost,
      departureDelay: this.departureDelay,
      previousObjective: this.previousObjective,
      latestReward: this.latestReward,
      actionLog: this.actionLog.map((entry) => ({ ...entry, action: { ...entry.action } })),
      activeEventIds: [...this.activeEventIds],
      temporaryReductions: [...this.temporaryReductions.entries()].map(([edgeId, value]) => [edgeId, { ...value }] as const),
      metrics: { ...this.metrics },
      forecasts: this.forecasts.map((forecast) => ({ ...forecast })),
      alerts: this.alerts.map((alert) => ({ ...alert })),
      lastForecastTime: this.lastForecastTime,
      forecastingEnabled: this.forecastingEnabled
    };
  }

  private restoreSnapshot(snapshot: ReturnType<SimulationEngine["createSnapshot"]>) {
    this.seed = snapshot.seed;
    this.time = snapshot.time;
    this.graph = snapshot.graph.clone();
    this.router = new Router(this.graph, this.scenario.congestion);
    this.rng = new SeededRandom(snapshot.seed);
    this.rng.setState(snapshot.rngState);
    this.demand = new DemandGenerator(this.scenario.demand, this.rng);
    this.demand.setState(snapshot.demandState);
    this.waiting = snapshot.waiting.map((trip) => ({ ...trip }));
    this.vehicles = snapshot.vehicles.map((vehicle) => ({ ...vehicle, route: [...vehicle.route] }));
    this.congestionCost = snapshot.congestionCost;
    this.departureDelay = snapshot.departureDelay;
    this.previousObjective = snapshot.previousObjective;
    this.latestReward = snapshot.latestReward;
    this.actionLog = snapshot.actionLog.map((entry) => ({ ...entry, action: { ...entry.action } }));
    this.activeEventIds = new Set(snapshot.activeEventIds);
    this.temporaryReductions = new Map(snapshot.temporaryReductions.map(([edgeId, value]) => [edgeId, { ...value }]));
    this.metrics = { ...snapshot.metrics };
    this.forecasts = snapshot.forecasts.map((forecast) => ({ ...forecast }));
    this.alerts = snapshot.alerts.map((alert) => ({ ...alert }));
    this.lastForecastTime = snapshot.lastForecastTime;
    this.forecastingEnabled = snapshot.forecastingEnabled;
  }

  private computeForecastsFromCurrent(): TrafficForecast[] {
    const horizons = this.scenario.forecast?.horizonsMinutes ?? ([5, 10, 15] as [number, number, number]);
    const clone = this.cloneForRollout();
    const edgeIds = Array.from(this.graph.edges.values())
      .filter((edge) => edge.major)
      .map((edge) => edge.id);
    const values = new Map<string, number[]>();
    for (const edgeId of edgeIds) values.set(edgeId, []);
    let elapsed = 0;
    for (const horizon of horizons) {
      clone.runFor(horizon - elapsed);
      elapsed = horizon;
      const state = clone.getInternalState();
      for (const edgeId of edgeIds) {
        values.get(edgeId)?.push(utilization(state.graph.edge(edgeId)));
      }
    }
    return edgeIds.map((edgeId) => {
      const edgeValues = values.get(edgeId) ?? [0, 0, 0];
      const current = utilization(this.graph.edge(edgeId));
      const max = Math.max(...edgeValues, current);
      return {
        edgeId,
        currentUtilization: current,
        utilization5m: edgeValues[0] ?? current,
        utilization10m: edgeValues[1] ?? current,
        utilization15m: edgeValues[2] ?? current,
        congestionRisk: Math.min(1, max / (this.scenario.forecast?.criticalUtilization ?? 1.25))
      };
    });
  }

  private getInternalState() {
    return {
      graph: this.graph,
      metrics: this.metrics
    };
  }

  private emptyMetrics(): SimulationMetrics {
    return {
      tripsRequested: 0,
      tripsCompleted: 0,
      activeTrips: 0,
      waitingTrips: 0,
      averageTravelTime: 0,
      medianTripTime: 0,
      p90TripTime: 0,
      p95TripTime: 0,
      maxTripTime: 0,
      averageSatisfaction: 100,
      congestionCost: 0,
      departureDelay: 0,
      excessDistance: 0,
      objective: 0,
      flow: 100
    };
  }
}
