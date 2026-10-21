import { writeFileSync } from "node:fs";
import { SimulationEngine } from "../src/simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../src/simulation/scenarios/MondayMorning";
import { ReactiveController } from "../src/simulation/controllers/ReactiveController";
import { ENGINE_VERSION, configurationIdentity } from "../src/simulation/logging/Identity";
import { utilization, effectiveCapacity } from "../src/simulation/traffic/CongestionModel";
import { policies } from "./clearance-policies";

const option = (key: string, fallback: string) => process.argv.find(v => v.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const seeds = option("seeds", "428193,428194,428195,428196,428197,428198,428199,428200,428201,428202").split(",").map(Number);
const names = option("policies", policies.map(p => p.name).join(",")).split(",");
const selected = names.map(name => { const p = policies.find(p => p.name === name); if (!p) throw Error(`Unknown policy ${name}`); return p; });
const cap = Number(option("limit", "240")), sample = Number(option("sample", "15"));
const beta = Number(option("beta", String(mondayMorningScenario.congestion.beta)));
if (!seeds.length || seeds.some(v => !Number.isSafeInteger(v)) || !Number.isFinite(cap) || cap <= 0 || cap % .25 || !Number.isFinite(sample) || sample <= 0 || sample % .25 || !Number.isFinite(beta) || beta <= 0) throw Error("Seeds must be integers; limit and sample positive tick-aligned minutes; beta positive.");
const scenario = structuredClone(mondayMorningScenario); scenario.congestion.beta = beta; scenario.evaluation = { maxClearanceMinutes: cap };
type Metrics = ReturnType<SimulationEngine["getObservation"]>["metrics"] & { accruedCost: number };
type Row = { seed: number; policy: string; decision: Metrics; final: Metrics; cleared: boolean; clearanceMinutes: number; stop: string; evaluation: ReturnType<SimulationEngine["getEvaluation"]>; checkpointEstimate: ReturnType<SimulationEngine["getDecisionCutoffMetrics"]>; bottleneckMinutes: Record<string, number>; series: unknown[]; traces: unknown[] };
const rows: Row[] = [];
for (const seed of seeds) for (const policy of selected) {
  let e = new SimulationEngine(scenario, undefined, true); e.reset(seed);
  const controller = new ReactiveController(), series: unknown[] = [], traces: unknown[] = [];
  const bottleneckMinutes: Record<string, number> = {};
  let previousCompleted = 0, previousDeparted = 0, previousTime = 0;
  const summarize = () => {
    const m = e.getObservation().metrics;
    return { ...m, accruedCost: m.objective - (m.objectiveBreakdown?.terminalHoldDelay ?? 0) };
  };
  let tracked: string[] = [];
  const sampleState = () => {
    const s = e.getState(), active = s.vehicles.filter(v => v.status === "traveling");
    const departed = s.vehicles.length;
    const edges = [...e.graph.edges.values()].map(edge => ({ id: edge.id, occupancy: edge.currentVehicleCount, comfortableOccupancy: effectiveCapacity(edge), maximumOccupancy: edge.maximumCapacity,
      utilization: utilization(edge), multiplier: edge.currentTravelTime / edge.baseTravelTime, closed: edge.closed, capacityModifier: edge.capacityModifier }));
    const predicted = (v: typeof active[number]) => v.route.slice(v.currentEdgeIndex).reduce((sum, id, index) => sum + e.graph.edge(id).currentTravelTime * (index ? 1 : 1 - v.edgeProgress), 0);
    if (!tracked.length && s.time >= 120) tracked = active.sort((a, b) => predicted(b) - predicted(a)).slice(0, 3).map(v => v.id);
    for (const id of tracked) {
      const v = s.vehicles.find(v => v.id === id)!;
      traces.push({ time: s.time, id, status: v.status, route: v.route, currentEdgeIndex: v.currentEdgeIndex, progress: v.edgeProgress,
        distanceKm: v.distanceKm, elapsedTravelMinutes: (v.actualArrivalTime ?? s.time) - v.actualDepartureTime!, predictedRemainingMinutes: v.status === "traveling" ? predicted(v) : 0,
        // Instantaneous speed implied by current congestion, distinct from measured interval movement below.
        instantaneousSpeedKph: v.status === "traveling" && v.edgeProgress < 1 ? e.graph.edge(v.route[v.currentEdgeIndex]).lengthKm / e.graph.edge(v.route[v.currentEdgeIndex]).currentTravelTime * 60 : 0 });
    }
    series.push({ minute: s.time, active: active.length, waiting: s.waiting.length, completed: s.metrics.tripsCompleted,
      departures: departed - previousDeparted, arrivals: s.metrics.tripsCompleted - previousCompleted, intervalMinutes: s.time - previousTime,
      remainingHeldPassengerMinutes: s.waiting.reduce((sum, t) => sum + Math.max(0, (t.heldUntil ?? 0) - s.time), 0),
      originUnreachable: s.waiting.filter(t => !e.router.findRoute(t.origin, t.destination).length).length,
      inNetworkQueued: active.filter(v => v.edgeProgress === 1).length,
      repeatedNodeRoutes: active.filter(v => new Set([e.graph.edge(v.route[0]).from, ...v.route.map(id => e.graph.edge(id).to)]).size < v.route.length + 1).length,
      totalDistanceKm: s.vehicles.reduce((sum, v) => sum + v.distanceKm, 0), edges });
    previousCompleted = s.metrics.tripsCompleted; previousDeparted = departed; previousTime = s.time;
  };
  const tickBottlenecks = () => { for (const edge of e.graph.edges.values()) if (utilization(edge) > 1) bottleneckMinutes[edge.id] = (bottleneckMinutes[edge.id] ?? 0) + e.dtMinutes; };
  sampleState();
  for (let tick = 0; e.decisionsOpen(); tick++) {
    e.step(policy.name === "reactive" ? controller.decide(e.getObservation()) ?? { type: "NO_OP" } : policy.decide(tick, e)); tickBottlenecks();
    if ((e.getObservation().time - scenario.startTime) % sample === 0) sampleState();
  }
  if (previousTime !== 120) sampleState();
  const decision = summarize(), actionCount = e.createRun().actions.length;
  // Continue this authoritative run under its configured evaluation contract.
  while (!e.isDone() && e.getObservation().activeTrips + e.getObservation().waitingTrips > 0) {
    e.step(); tickBottlenecks(); if ((e.getObservation().time - scenario.startTime) % sample === 0) sampleState();
  }
  if (previousTime !== e.getObservation().time - scenario.startTime) sampleState();
  const final = summarize(), cleared = final.activeTrips + final.waitingTrips === 0;
  if (final.tripsRequested !== decision.tripsRequested || e.createRun().actions.length !== actionCount) throw Error("Continuation changed demand or actions");
  // Measured interval speed includes time blocked and route transitions; no fixed-speed approximation.
  for (let i = 1; i < traces.length; i++) {
    const point = traces[i] as any, prev = (traces.slice(0, i) as any[]).reverse().find(v => v.id === point.id);
    if (prev) point.intervalSpeedKph = (point.distanceKm - prev.distanceKm) / (point.time - prev.time) * 60;
  }
  rows.push({ seed, policy: policy.name, decision, final, cleared, clearanceMinutes: e.getObservation().time - scenario.endTime,
    stop: cleared ? "all trips arrived" : "safety limit; censored", evaluation: e.getEvaluation(), checkpointEstimate: e.getDecisionCutoffMetrics(), bottleneckMinutes, series, traces });
  console.log(`${seed} ${policy.name}: ${cleared ? "cleared" : "CENSORED"} +${rows.at(-1)!.clearanceMinutes}m; ${final.activeTrips} active, ${final.waitingTrips} waiting`);
}
const aggregates = selected.map(p => {
  const r = rows.filter(row => row.policy === p.name), mean = (get: (row: typeof r[number]) => number) => r.reduce((s, row) => s + get(row), 0) / r.length;
  return { policy: p.name, cleared: r.filter(v => v.cleared).length, meanDecisionCost: mean(v => v.decision.objective), meanCutoffHoldEstimate: mean(v => v.checkpointEstimate?.objectiveBreakdown?.terminalHoldDelay ?? 0), meanFinalAccruedCost: mean(v => v.final.accruedCost),
    meanClearanceMinutes: mean(v => v.clearanceMinutes), meanCompleted: mean(v => v.final.tripsCompleted), meanActive: mean(v => v.final.activeTrips), meanWaiting: mean(v => v.final.waitingTrips),
    meanTravelPassengerMinutes: mean(v => v.final.objectiveBreakdown!.travelTime / scenario.objectiveWeights.travelTime), meanWaitingPassengerMinutes: mean(v => v.final.departureDelay),
    meanSatisfaction: mean(v => v.final.averageSatisfaction), meanCongestion: mean(v => v.final.congestionCost), meanExcessKm: mean(v => v.final.excessDistance),
    pairedRankingChanges: r.filter(v => { const b = rows.find(b => b.seed === v.seed && b.policy === "baseline"); return b && b.cleared && v.cleared && Math.sign(v.decision.objective - b.decision.objective) !== Math.sign(v.final.accruedCost - b.final.accruedCost); }).length };
});
const rankings = seeds.map(seed => {
  const paired = rows.filter(row => row.seed === seed);
  const decisionOrder = [...paired].sort((a, b) => a.decision.objective - b.decision.objective).map(r => r.policy);
  const finalOrder = paired.filter(r => r.cleared).sort((a, b) => a.final.accruedCost - b.final.accruedCost).map(r => r.policy);
  return { seed, decisionOrder, finalOrder, incompletePolicies: paired.filter(r => !r.cleared).map(r => r.policy), fullClearance: paired.every(r => r.cleared) };
});
const out = option("out", "/private/tmp/central-traffic-clearance.json");
writeFileSync(out, JSON.stringify({ settings: { engine: ENGINE_VERSION, identity: configurationIdentity(scenario), scenarioVersion: scenario.version, seeds, policies: names, cap, sample, beta,
  diagnosticOnly: cap !== mondayMorningScenario.evaluation!.maxClearanceMinutes || beta !== mondayMorningScenario.congestion.beta, officialEvaluationChanged: false, noNewDemandOrActions: true, terminalEstimateExcludedFromContinuedAccruedCost: true }, aggregates, rankings, rows }, null, 2));
console.log(out);
