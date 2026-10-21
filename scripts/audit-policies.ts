import { ENGINE_VERSION, configurationIdentity } from "../src/simulation/logging/Identity";
import { writeFileSync } from "node:fs";
import { SimulationEngine } from "../src/simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../src/simulation/scenarios/MondayMorning";
import { ReactiveController } from "../src/simulation/controllers/ReactiveController";
import type { SimulationAction, SimulationMetrics } from "../src/simulation/types";

const runs = Number(process.argv.find(arg => arg.startsWith("--runs="))?.split("=")[1] ?? 10);
const out = process.argv.find(arg => arg.startsWith("--out="))?.slice(6) ?? "/private/tmp/central-traffic-policy-audit.json";
const clearanceCap = Number(process.argv.find(arg => arg.startsWith("--clearance-minutes="))?.split("=")[1] ?? 240);
if (!Number.isFinite(clearanceCap) || clearanceCap <= 0 || clearanceCap % .25) throw Error("clearance-minutes must be positive and tick-aligned; zero-cutoff evaluation is no longer official.");
const scoringScenario = { ...mondayMorningScenario, evaluation: { maxClearanceMinutes: clearanceCap } };
const policies = ["baseline", "reactive", "repeated-road-hold", "long-all-hold", "continuous-long-hold", "aggressive-reroute", "late-hold", "late-reroute"];
const rows: any[] = [];
const summary = (metrics: SimulationMetrics) => ({ requested: metrics.tripsRequested, completed: metrics.tripsCompleted, active: metrics.activeTrips, waiting: metrics.waitingTrips,
  travelPassengerMinutes: metrics.objectiveBreakdown!.travelTime / mondayMorningScenario.objectiveWeights.travelTime,
  waitingPassengerMinutes: metrics.departureDelay, committedWaitingPassengerMinutes: metrics.remainingHoldPassengerMinutes ?? 0, satisfaction: metrics.averageSatisfaction, congestion: metrics.congestionCost,
  excessDistanceKm: metrics.excessDistance, components: metrics.objectiveBreakdown, objective: metrics.objective });
for (let index = 0; index < runs; index++) {
  const seed = (mondayMorningScenario.seed ?? 428193) + index;
  for (const policy of policies) {
    let engine = new SimulationEngine(scoringScenario, undefined, true); engine.reset(seed);
    const reactive = new ReactiveController();
    for (let tick = 0; engine.decisionsOpen(); tick++) {
      const minute = tick * 0.25;
      let action: SimulationAction = { type: "NO_OP" };
      if (policy === "reactive") action = reactive.decide(engine.getObservation()) ?? action;
      if (policy === "repeated-road-hold" && tick % 4 === 0) action = { type: "DELAY_DEPARTURES", targetEdge: "north_bridge", percentage: 0.25, durationMinutes: 5 };
      if (policy === "long-all-hold" && tick % 20 === 0) action = { type: "DELAY_DEPARTURES", percentage: 1, durationMinutes: 120 };
      if (policy === "continuous-long-hold") action = { type: "DELAY_DEPARTURES", percentage: 1, durationMinutes: 120 };
      if (policy === "aggressive-reroute" && tick % 20 === 0) action = { type: "REROUTE", targetEdge: "north_bridge", percentage: 1, avoidEdge: "north_bridge" };
      if (policy === "late-hold" && minute >= 105 && tick % 4 === 0) action = { type: "DELAY_DEPARTURES", targetEdge: "north_bridge", percentage: 1, durationMinutes: 60 };
      if (policy === "late-reroute" && minute >= 105 && tick % 8 === 0) action = { type: "REROUTE", targetEdge: "north_bridge", percentage: 1, avoidEdge: "north_bridge" };
      engine.step(action);
    }
    const atDecisionEnd = summary(engine.getState().metrics);
    // Diagnostic only: stop new demand at the original end, retain all trips/holds/costs,
    // and evaluate no-further-intervention clearance only up to the configured cap.

    let observation = engine.getObservation();
    while (!engine.isDone() && observation.activeTrips + observation.waitingTrips > 0) observation = engine.step().observation;
    const cleared = engine.getObservation().activeTrips + engine.getObservation().waitingTrips === 0;
    console.log(`Policy ${seed} ${policy}: end cost ${atDecisionEnd.objective.toFixed(0)}, clearance censored=${!cleared}`);
    rows.push({ seed, policy, decisionEnd: atDecisionEnd, checkpointEstimate: engine.getDecisionCutoffMetrics(), evaluation: engine.getEvaluation(), clearance: summary(engine.getState().metrics), clearanceMinutes: engine.getState().time - 120, cleared });
  }
  console.log(`Audited seed ${seed}`);
}
const meanObject = (values: any[]): any => Object.fromEntries(Object.keys(values[0]).map(key => [key, typeof values[0][key] === "number" ? values.reduce((sum, row) => sum + row[key], 0) / values.length : meanObject(values.map(row => row[key]))]));
const aggregate = policies.map(policy => ({ policy, decisionEnd: meanObject(rows.filter(row => row.policy === policy).map(row => row.decisionEnd)), clearance: meanObject(rows.filter(row => row.policy === policy).map(row => row.clearance)),
  clearedRuns: rows.filter(row => row.policy === policy && row.cleared).length,
  reversals: rows.filter(row => row.policy === policy && row.decisionEnd.objective < rows.find(base => base.seed === row.seed && base.policy === "baseline").decisionEnd.objective && row.clearance.objective > rows.find(base => base.seed === row.seed && base.policy === "baseline").clearance.objective).length }));
writeFileSync(out, JSON.stringify({ conditions: { engine: ENGINE_VERSION, scenarioVersion: scoringScenario.version, identity: configurationIdentity(scoringScenario), officialClearance: true, terminalEstimateExcludedFromRealizedCost: true, unusedForecastsSkipped: true, terminalHoldAccounting: !!scoringScenario.terminalHoldAccounting, seeds: [428193, 428193 + runs - 1], decisionWindowMinutes: 120, diagnosticClearanceCapMinutes: clearanceCap, noFurtherDemandOrIntervention: true }, aggregate, rows }, null, 2));
console.log(JSON.stringify(aggregate, null, 2)); console.log(`Local report: ${out}`);
