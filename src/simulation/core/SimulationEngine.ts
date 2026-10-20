import { SeededRandom } from "./SeededRandom";
import { TrafficGraph } from "../network/TrafficGraph";
import { Router, type RoutingContext } from "../network/Router";
import { travelTime, utilization } from "../traffic/CongestionModel";
import { DemandGenerator } from "../traffic/DemandGenerator";
import { ENGINE_VERSION } from "../logging/Identity";
import { calculateMetrics, cloneMetrics } from "../scoring/Metrics";
import { createAlerts } from "../forecasting/TrafficPredictor";
import type {
  ActionPreview,
  EdgeObservation,
  ForecastDelta,
  ForecastSample,
  GraphSnapshot,
  LoggedAction,
  Scenario,
  SimulationAction,
  SimulationMetrics,
  SimulationObservation,
  SimulationRun,
  SimulationSnapshot,
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
  private latestActionAffected = 0;
  private actionLog: LoggedAction[] = [];
  private activeEventIds = new Set<string>();
  private temporaryReductions = new Map<string, { until: number; modifier: number }>();
  private metrics: SimulationMetrics;
  private forecastingEnabled = true;
  private lastForecastTime = Number.NEGATIVE_INFINITY;
  forecasts: TrafficForecast[] = [];
  alerts: TrafficAlert[] = [];

  constructor(private scenario: Scenario, private readonly timing?: (name: string, milliseconds: number) => void) {
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
    this.latestActionAffected = 0;
    this.actionLog = [];
    this.activeEventIds.clear();
    this.temporaryReductions.clear();
    this.forecasts = [];
    this.alerts = [];
    this.lastForecastTime = Number.NEGATIVE_INFINITY;
    this.forecastingEnabled = true;
    this.graph = new TrafficGraph(this.scenario.graph);
    this.router = new Router(this.graph, this.scenario.congestion);
    this.rng = new SeededRandom(seed);
    this.demand = new DemandGenerator(this.scenario.demand, this.rng);
    this.metrics = this.emptyMetrics();
    this.updateDerived();
    return this.getObservation();
  }

  step(action: SimulationAction = { type: "NO_OP" }) {
    const measuredStart = this.timing ? performance.now() : 0;
    if (this.isDone()) {
      return { observation: this.getObservation(), reward: 0, done: true, info: this.getInfo() };
    }
    const actionToApply = this.cloneAction(action);
    const before = this.metrics.objective;
    const intervalStart = this.time;
    const intervalEnd = this.time + this.dtMinutes;
    this.processEvents();
    this.restoreTemporaryReductions();
    this.latestActionAffected = this.applyAction(actionToApply);
    if (actionToApply.type !== "NO_OP") this.lastForecastTime = Number.NEGATIVE_INFINITY;
    this.dispatchTrips();
    this.departureDelay += this.waiting.length * this.dtMinutes;
    this.updateEdgeCounts();
    this.updateTravelTimes();
    this.moveVehicles(intervalStart);
    this.time = intervalEnd;
    this.waiting.push(...this.demand.generate(this.time, this.dtMinutes));
    this.updateEdgeCounts();
    this.updateDerived();
    const reward = before - this.metrics.objective;
    this.latestReward = reward;
    if (actionToApply.type !== "NO_OP") {
      this.actionLog.push({
        simulationTime: this.time,
        stateSnapshotId: `t_${this.time.toFixed(2)}`,
        action: this.cloneAction(actionToApply),
        immediateReward: reward,
        affectedCount: this.latestActionAffected
      });
    }
    this.previousObjective = this.metrics.objective;
    const result = { observation: this.getObservation(), reward, done: this.isDone(), info: this.getInfo() };
    this.timing?.("tick", performance.now() - measuredStart);
    return result;
  }

  getState() {
    return {
      time: this.time,
      graph: this.graph.clone(),
      waiting: this.waiting.map((trip) => ({ ...trip })),
      vehicles: this.vehicles.map((vehicle) => ({ ...vehicle, route: [...vehicle.route] })),
      metrics: cloneMetrics(this.metrics),
      forecasts: this.forecasts.map((forecast) => this.cloneForecast(forecast)),
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
      metrics: cloneMetrics(this.metrics)
    };
  }

  getInfo() {
    return {
      activeEventIds: [...this.activeEventIds],
      alerts: this.alerts.map((alert) => ({ ...alert })),
      forecasts: this.forecasts.map((forecast) => this.cloneForecast(forecast))
    };
  }

  isDone() {
    return this.time >= this.scenario.endTime - this.scenario.startTime;
  }

  previewAction(action: SimulationAction): ActionPreview {
    this.validateForecastConfig();
    const requestedHorizon = this.scenario.forecast?.previewHorizonMinutes ?? 15;
    const forecastHorizons = this.scenario.forecast?.horizonsMinutes ?? ([5, 10, 15] as [number, number, number]);
    const horizons = this.sortedHorizons([...forecastHorizons, requestedHorizon]);
    const noAction = this.cloneForRollout();
    const withAction = this.cloneForRollout();
    const trackedEdges = this.previewEdgeIds(action);
    const noActionSamples = noAction.rolloutSamples(horizons, trackedEdges);
    const actionSamples = withAction.rolloutSamples(horizons, trackedEdges, action);
    const previewSampleIndex = this.sampleIndexAt(noActionSamples, requestedHorizon);
    const beforeSample = noActionSamples[previewSampleIndex];
    const afterSample = actionSamples[previewSampleIndex];
    const before = beforeSample.metrics;
    const after = afterSample.metrics;
    const beforeDelay = beforeSample.passengerDelayMinutes;
    const afterDelay = afterSample.passengerDelayMinutes;
    const passengers = Math.max(1, afterSample.passengerCount);
    const edgeIds = new Set<string>();
    for (const sample of noActionSamples) for (const edgeId of sample.utilizationByEdge.keys()) edgeIds.add(edgeId);
    const forecastChanges: ForecastDelta[] = [];
    for (const edgeId of edgeIds) {
      const seenActualHorizons = new Set<number>();
      for (let index = 0; index < noActionSamples.length; index++) {
        const beforeSample = noActionSamples[index];
        const actionSample = actionSamples[index];
        if (seenActualHorizons.has(beforeSample.actualHorizonMinutes)) continue;
        seenActualHorizons.add(beforeSample.actualHorizonMinutes);
        const beforeUtilization = beforeSample.utilizationByEdge.get(edgeId) ?? 0;
        const afterUtilization = actionSample.utilizationByEdge.get(edgeId) ?? 0;
        if (Math.abs(beforeUtilization - afterUtilization) > 0.000001 || edgeId === (action as { targetEdge?: string }).targetEdge) {
          forecastChanges.push({
            edgeId,
            horizonMinutes: beforeSample.actualHorizonMinutes,
            requestedHorizonMinutes: beforeSample.horizonMinutes,
            actualHorizonMinutes: beforeSample.actualHorizonMinutes,
            truncated: beforeSample.actualHorizonMinutes + 0.000001 < beforeSample.horizonMinutes,
            before: beforeUtilization,
            after: afterUtilization
          });
        }
      }
    }
    return {
      affectedVehicles: actionSamples[0]?.affectedTrips ?? 0,
      networkCostDelta: after.objective - before.objective,
      forecastChanges,
      passengerDelayDeltaMinutes: afterDelay - beforeDelay,
      passengerDelayDeltaPerPassenger: (afterDelay - beforeDelay) / passengers,
      satisfactionDelta: after.averageSatisfaction - before.averageSatisfaction,
      horizonMinutes: afterSample.actualHorizonMinutes,
      requestedHorizonMinutes: requestedHorizon,
      truncated: afterSample.actualHorizonMinutes + 0.000001 < requestedHorizon
    };
  }

  exportSnapshot(): SimulationSnapshot {
    const started = this.timing ? performance.now() : 0;
    const snapshot = this.createSnapshot();
    this.timing?.("snapshot", performance.now() - started);
    return snapshot;
  }

  restoreFromSnapshot(snapshot: SimulationSnapshot) {
    this.restoreSnapshot(snapshot);
  }

  createRun(): SimulationRun {
    return {
      scenarioId: this.scenario.id,
      seed: this.seed,
      engineVersion: ENGINE_VERSION,
      startedAt: new Date(0).toISOString(),
      actions: this.actionLog.map((entry) => ({
        ...entry,
        action: this.cloneAction(entry.action)
      })),
      finalMetrics: cloneMetrics(this.metrics)
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

  private applyAction(action: SimulationAction): number {
    if (action.type === "NO_OP") return 0;
    if (action.type === "REROUTE") return this.reroute(action.targetEdge, action.percentage, action.avoidEdge ?? action.targetEdge);
    if (action.type === "DELAY_DEPARTURES") {
      const trips = this.matchingTrips(action);
      const count = Math.floor(trips.length * action.percentage);
      let changed = 0;
      for (const trip of trips.slice(0, count)) {
        const nextHeldUntil = Math.max(trip.heldUntil ?? 0, this.time + action.durationMinutes);
        if (trip.heldUntil !== nextHeldUntil) changed += 1;
        trip.heldUntil = nextHeldUntil;
      }
      return changed;
    }
    if (action.type === "RELEASE_DEPARTURES") {
      let changed = 0;
      for (const trip of this.matchingTrips(action)) {
        if (trip.heldUntil !== undefined) changed += 1;
        trip.heldUntil = undefined;
      }
      return changed;
    }
    if (action.type === "DEBUG_SPAWN") {
      this.spawnDebug(action.count);
      return action.count;
    }
    if (action.type === "DEBUG_INCIDENT") {
      this.graph.edge(action.edgeId).capacityModifier = action.capacityModifier;
      this.temporaryReductions.set(action.edgeId, { until: this.time + action.durationMinutes, modifier: action.capacityModifier });
      return 1;
    }
    if (action.type === "DEBUG_CLEAR_INCIDENT") {
      const changed = this.graph.edge(action.edgeId).capacityModifier !== 1 || this.temporaryReductions.has(action.edgeId);
      this.graph.edge(action.edgeId).capacityModifier = 1;
      this.temporaryReductions.delete(action.edgeId);
      return changed ? 1 : 0;
    }
    return 0;
  }

  private matchingTrips(filter: { origin?: string; destination?: string; targetEdge?: string }) {
    return this.waiting.filter(
      (trip) =>
        (!filter.origin || trip.origin === filter.origin) &&
        (!filter.destination || trip.destination === filter.destination) &&
        (!filter.targetEdge || this.routeForTripIncludesEdge(trip, filter.targetEdge))
    );
  }

  private routeForTripIncludesEdge(trip: TripRequest, edgeId: string) {
    const route = this.router.findRoute(trip.origin, trip.destination);
    return route.includes(edgeId);
  }

  private reroute(targetEdge: string, percentage: number, avoidEdge: string): number {
    const candidates = this.vehicles.filter(
      (vehicle) => vehicle.status === "traveling" && vehicle.route.slice(vehicle.currentEdgeIndex + 1).includes(targetEdge)
    );
    const count = Math.floor(candidates.length * percentage);
    let changed = 0;
    for (const vehicle of candidates.slice(0, count)) {
      const currentEdge = this.graph.edge(vehicle.route[vehicle.currentEdgeIndex]);
      const from = currentEdge.to;
      const route = this.router.findRoute(from, vehicle.destination, { avoidEdges: [avoidEdge] });
      if (route.length) {
        vehicle.route = [...vehicle.route.slice(0, vehicle.currentEdgeIndex + 1), ...route];
        vehicle.rerouteCount += 1;
        vehicle.satisfaction = Math.max(0, vehicle.satisfaction - this.scenario.satisfaction.reroute);
        changed += 1;
      }
    }
    return changed;
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

  private moveVehicles(intervalStart: number) {
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
      const started = this.timing ? performance.now() : 0;
      this.forecasts = this.computeForecastsFromCurrent();
      this.timing?.("forecastMain", performance.now() - started);
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

  private createSnapshot(): SimulationSnapshot {
    return {
      version: 1,
      scenario: this.cloneScenario(this.scenario),
      seed: this.seed,
      time: this.time,
      graph: this.graphSnapshot(),
      rngState: this.rng.getState(),
      demandState: this.demand.getState(),
      waiting: this.waiting.map((trip) => ({ ...trip })),
      vehicles: this.vehicles.map((vehicle) => ({ ...vehicle, route: [...vehicle.route] })),
      congestionCost: this.congestionCost,
      departureDelay: this.departureDelay,
      previousObjective: this.previousObjective,
      latestReward: this.latestReward,
      latestActionAffected: this.latestActionAffected,
      actionLog: this.actionLog.map((entry) => ({ ...entry, action: this.cloneAction(entry.action) })),
      activeEventIds: [...this.activeEventIds],
      temporaryReductions: [...this.temporaryReductions.entries()].map(([edgeId, value]) => [edgeId, { ...value }] as const),
      metrics: cloneMetrics(this.metrics),
      forecasts: this.forecasts.map((forecast) => this.cloneForecast(forecast)),
      alerts: this.alerts.map((alert) => ({ ...alert })),
      lastForecastTime: this.lastForecastTime,
      forecastingEnabled: this.forecastingEnabled
    };
  }

  private restoreSnapshot(snapshot: SimulationSnapshot) {
    if (snapshot.version !== 1) throw new Error(`Unsupported simulation snapshot version: ${snapshot.version}`);
    this.scenario = this.cloneScenario(snapshot.scenario);
    this.seed = snapshot.seed;
    this.time = snapshot.time;
    this.graph = this.graphFromSnapshot(snapshot.graph);
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
    this.latestActionAffected = snapshot.latestActionAffected;
    this.actionLog = snapshot.actionLog.map((entry) => ({ ...entry, action: this.cloneAction(entry.action) }));
    this.activeEventIds = new Set(snapshot.activeEventIds);
    this.temporaryReductions = new Map(snapshot.temporaryReductions.map(([edgeId, value]) => [edgeId, { ...value }]));
    this.metrics = cloneMetrics(snapshot.metrics);
    this.forecasts = snapshot.forecasts.map((forecast) => this.cloneForecast(forecast));
    this.alerts = snapshot.alerts.map((alert) => ({ ...alert }));
    this.lastForecastTime = snapshot.lastForecastTime;
    this.forecastingEnabled = snapshot.forecastingEnabled;
  }

  private rolloutSamples(horizons: readonly number[], edgeIds: readonly string[], action?: SimulationAction) {
    const samples: Array<{
      horizonMinutes: number;
      actualHorizonMinutes: number;
      metrics: SimulationMetrics;
      utilizationByEdge: Map<string, number>;
      passengerDelayMinutes: number;
      passengerCount: number;
      affectedTrips: number;
    }> = [];
    let elapsed = 0;
    let affectedTrips = 0;
    for (const horizon of horizons) {
      while (elapsed < horizon && !this.isDone()) {
        if (action && elapsed === 0) {
          this.step(action);
          affectedTrips = this.latestActionAffected;
        } else {
          this.step({ type: "NO_OP" });
        }
        elapsed += this.dtMinutes;
      }
      const utilizationByEdge = new Map<string, number>();
      for (const edgeId of edgeIds) utilizationByEdge.set(edgeId, utilization(this.graph.edge(edgeId)));
      samples.push({
        horizonMinutes: horizon,
        actualHorizonMinutes: elapsed,
        metrics: cloneMetrics(this.metrics),
        utilizationByEdge,
        passengerDelayMinutes: this.passengerDelayMinutes(),
        passengerCount: this.vehicles.length + this.waiting.length,
        affectedTrips
      });
    }
    return samples;
  }

  private passengerDelayMinutes() {
    const vehicleDelay = this.vehicles.reduce((sum, vehicle) => {
      const end = vehicle.actualArrivalTime ?? this.time;
      const elapsed = Math.max(0, end - (vehicle.actualDepartureTime ?? end));
      return sum + Math.max(0, elapsed - vehicle.baselineTravelTime);
    }, 0);
    return this.departureDelay + vehicleDelay;
  }

  private cloneAction<T extends SimulationAction>(action: T): T {
    return { ...action } as T;
  }

  private cloneForecast(forecast: TrafficForecast): TrafficForecast {
    return {
      ...forecast,
      samples: forecast.samples.map((sample) => ({ ...sample }))
    };
  }

  private sortedHorizons(horizons: readonly number[]) {
    const unique = Array.from(new Set(horizons.map((horizon) => Number(horizon.toFixed(6)))));
    unique.sort((a, b) => a - b);
    return unique;
  }

  private sampleIndexAt(
    samples: Array<{ horizonMinutes: number }>,
    horizon: number
  ) {
    const index = samples.findIndex((sample) => Math.abs(sample.horizonMinutes - horizon) < 0.000001);
    if (index === -1) throw new Error(`Preview horizon ${horizon} was not sampled`);
    return index;
  }

  private previewEdgeIds(action: SimulationAction) {
    const ids = new Set(
      Array.from(this.graph.edges.values())
        .filter((edge) => edge.major)
        .map((edge) => edge.id)
    );
    const targetEdge = "targetEdge" in action ? action.targetEdge : undefined;
    if (targetEdge) ids.add(targetEdge);
    return [...ids];
  }

  private validateForecastConfig() {
    const forecast = this.scenario.forecast;
    if (!forecast) return;
    const horizons = [...forecast.horizonsMinutes, forecast.previewHorizonMinutes];
    for (const horizon of horizons) {
      if (!Number.isFinite(horizon) || horizon <= 0) throw new Error(`Invalid forecast horizon: ${horizon}`);
      const ticks = horizon / this.dtMinutes;
      if (Math.abs(ticks - Math.round(ticks)) > 0.000001) {
        throw new Error(`Invalid forecast horizon ${horizon}: horizons must align to ${this.dtMinutes}-minute ticks`);
      }
    }
  }

  private graphSnapshot(): GraphSnapshot {
    return {
      nodes: Array.from(this.graph.nodes.values()).map((node) => ({ ...node })),
      edges: Array.from(this.graph.edges.values()).map((edge) => ({ ...edge }))
    };
  }

  private graphFromSnapshot(snapshot: GraphSnapshot) {
    const graph = new TrafficGraph({
      nodes: snapshot.nodes.map((node) => ({ ...node })),
      edges: snapshot.edges.map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        lengthKm: edge.lengthKm,
        speedLimitKph: edge.speedLimitKph,
        comfortableCapacity: edge.comfortableCapacity,
        maximumCapacity: edge.maximumCapacity,
        name: edge.name,
        major: edge.major
      }))
    });
    for (const edge of snapshot.edges) Object.assign(graph.edge(edge.id), { ...edge });
    return graph;
  }

  private cloneScenario(scenario: Scenario): Scenario {
    return {
      ...scenario,
      graph: {
        nodes: scenario.graph.nodes.map((node) => ({ ...node })),
        edges: scenario.graph.edges.map((edge) => ({ ...edge }))
      },
      demand: {
        curve: scenario.demand.curve.map((point) => ({ ...point })),
        pairs: scenario.demand.pairs.map((pair) => ({ ...pair })),
        passengerTolerance: [...scenario.demand.passengerTolerance]
      },
      events: scenario.events.map((event) => ({ ...event })),
      objectiveWeights: { ...scenario.objectiveWeights },
      congestion: { ...scenario.congestion },
      satisfaction: { ...scenario.satisfaction },
      forecast: scenario.forecast
        ? {
            ...scenario.forecast,
            horizonsMinutes: [...scenario.forecast.horizonsMinutes] as [number, number, number]
          }
        : undefined
    };
  }

  private computeForecastsFromCurrent(): TrafficForecast[] {
    this.validateForecastConfig();
    const horizons = this.scenario.forecast?.horizonsMinutes ?? ([5, 10, 15] as [number, number, number]);
    const clone = this.cloneForRollout();
    const edgeIds = Array.from(this.graph.edges.values())
      .filter((edge) => edge.major)
      .map((edge) => edge.id);
    const samplesByEdge = new Map<string, ForecastSample[]>();
    for (const edgeId of edgeIds) samplesByEdge.set(edgeId, []);
    let elapsed = 0;
    for (const horizon of horizons) {
      clone.runFor(horizon - elapsed);
      elapsed = clone.time - this.time;
      const state = clone.getInternalState();
      for (const edgeId of edgeIds) {
        const actualHorizonMinutes = elapsed;
        const edgeSamples = samplesByEdge.get(edgeId) ?? [];
        if (!edgeSamples.some((sample) => Math.abs(sample.actualHorizonMinutes - actualHorizonMinutes) < 0.000001)) {
          edgeSamples.push({
            requestedHorizonMinutes: horizon,
            actualHorizonMinutes,
            truncated: actualHorizonMinutes + 0.000001 < horizon,
            utilization: utilization(state.graph.edge(edgeId))
          });
        }
        samplesByEdge.set(edgeId, edgeSamples);
      }
    }
    return edgeIds.map((edgeId) => {
      const edgeSamples = samplesByEdge.get(edgeId) ?? [];
      const valueAtRequested = (requested: number) =>
        edgeSamples.find((sample) => Math.abs(sample.requestedHorizonMinutes - requested) < 0.000001)?.utilization ??
        edgeSamples.at(-1)?.utilization ??
        current;
      const current = utilization(this.graph.edge(edgeId));
      const max = Math.max(...edgeSamples.map((sample) => sample.utilization), current);
      return {
        edgeId,
        currentUtilization: current,
        utilization5m: valueAtRequested(horizons[0]),
        utilization10m: valueAtRequested(horizons[1]),
        utilization15m: valueAtRequested(horizons[2]),
        samples: edgeSamples,
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
      objectiveBreakdown: { travelTime: 0, congestion: 0, departureDelay: 0, dissatisfaction: 0, excessDistance: 0 },
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
