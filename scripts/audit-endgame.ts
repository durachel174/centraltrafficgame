import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { SimulationEngine } from "../src/simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../src/simulation/scenarios/MondayMorning";
import { ReactiveController } from "../src/simulation/controllers/ReactiveController";
import { ENGINE_VERSION, configurationIdentity } from "../src/simulation/logging/Identity";
import type { SimulationAction, SimulationMetrics } from "../src/simulation/types";

const option = (name: string, fallback: string) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const runs = Number(option("runs", "10")), cap = Number(option("clearance-minutes", "240"));
if (!Number.isInteger(runs) || runs < 1 || !Number.isFinite(cap) || cap < 0 || cap % 0.25) throw new Error("runs must be a positive integer; clearance cap must be nonnegative and tick-aligned.");
const output = option("out", "/private/tmp/central-traffic-endgame-audit.json");
type Policy = { name: string; decide: (tick: number, engine: SimulationEngine) => SimulationAction };
const none: SimulationAction = { type: "NO_OP" };
const reroute = (percentage: number): SimulationAction => ({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage });
const hold = (percentage: number, durationMinutes: number): SimulationAction => ({ type: "DELAY_DEPARTURES", percentage, durationMinutes });
const policies: Policy[] = [
  { name: "baseline", decide: () => none },
  { name: "reactive", decide: () => none },
  { name: "repeated-hold-25-5m", decide: tick => tick % 4 === 0 ? hold(0.25, 5) : none },
  { name: "extended-hold-100-120m", decide: tick => tick % 20 === 0 ? hold(1, 120) : none },
  { name: "repeated-reroute-25", decide: tick => tick % 20 === 0 ? reroute(0.25) : none },
  { name: "repeated-reroute-100", decide: tick => tick % 20 === 0 ? reroute(1) : none },
  ...[90, 105, 115].flatMap(minute => [0.25, 1].map(percentage => ({ name: `late-reroute-${percentage * 100}-at-${minute}`, decide: (tick: number) => tick === minute * 4 ? reroute(percentage) : none }))),
  { name: "combined-25-from-90", decide: tick => tick < 360 ? none : tick % 4 === 0 ? hold(0.25, 5) : tick % 4 === 1 ? reroute(0.25) : none },
  { name: "combined-100-extended-from-105", decide: tick => tick < 420 ? none : tick % 4 === 0 ? hold(1, 120) : tick % 4 === 1 ? reroute(1) : none }
];
const metrics = (m: SimulationMetrics) => ({ requested: m.tripsRequested, completed: m.tripsCompleted, active: m.activeTrips, waiting: m.waitingTrips,
  travelPassengerMinutes: m.objectiveBreakdown!.travelTime / mondayMorningScenario.objectiveWeights.travelTime,
  accruedWaitingPassengerMinutes: m.departureDelay, remainingImposedWaitingPassengerMinutes: m.remainingHoldPassengerMinutes ?? 0,
  satisfactionPercent: m.averageSatisfaction, congestionUtilizationSquaredMinutes: m.congestionCost, excessDistanceKm: m.excessDistance,
  accruedCost: m.objective - m.objectiveBreakdown!.terminalHoldDelay, terminalCost: m.objectiveBreakdown!.terminalHoldDelay,
  components: m.objectiveBreakdown!, objective: m.objective });
type Summary = ReturnType<typeof metrics>;
const rows: Array<{ seed: number; policy: string; decisionEnd: Summary; diagnostic: Summary; diagnosticMinutes: number; cleared: boolean; stop: string; interventions: number }> = [];
const started = performance.now();
for (let i = 0; i < runs; i++) {
  const seed = 428193 + i;
  for (const policy of policies) {
    const engine = new SimulationEngine(mondayMorningScenario, undefined, true); engine.reset(seed);
    const reactive = new ReactiveController();
    for (let tick = 0; !engine.isDone(); tick++) engine.step(policy.name === "reactive" ? reactive.decide(engine.getObservation()) ?? none : policy.decide(tick, engine));
    const decisionEnd = metrics(engine.getObservation().metrics), interventions = engine.createRun().actions.length;
    // Independent diagnostic: original cost is retained above. No terminal liability is
    // carried into accrued costs; actual continued waiting is charged once by normal ticks.
    const snapshot = engine.exportSnapshot();
    snapshot.scenario = { ...snapshot.scenario, endTime: snapshot.scenario.endTime + cap, terminalHoldAccounting: false,
      demand: { ...snapshot.scenario.demand, curve: [{ minute: 0, tripsPerMinute: 0 }, { minute: 120 + cap + 1, tripsPerMinute: 0 }] } };
    snapshot.forecastingEnabled = false;
    const diagnosticEngine = new SimulationEngine(snapshot.scenario, undefined, true); diagnosticEngine.restoreFromSnapshot(snapshot);
    let observation = diagnosticEngine.getObservation();
    while (!diagnosticEngine.isDone() && observation.activeTrips + observation.waitingTrips > 0) observation = diagnosticEngine.step().observation;
    const cleared = observation.activeTrips + observation.waitingTrips === 0;
    rows.push({ seed, policy: policy.name, decisionEnd, diagnostic: cap ? metrics(observation.metrics) : decisionEnd,
      diagnosticMinutes: observation.time - mondayMorningScenario.endTime, cleared, stop: cap === 0 ? "not run" : cleared ? "all trips finished" : "cap reached; censored", interventions });
  }
  console.log(`Endgame audit seed ${seed}: ${policies.length} paired policies`);
}
const mean = (values: any[]): any => Object.fromEntries(Object.keys(values[0]).map(key => [key, typeof values[0][key] === "number" ? values.reduce((sum, row) => sum + row[key], 0) / values.length : mean(values.map(row => row[key]))]));
const aggregate = policies.map(policy => {
  const selected = rows.filter(row => row.policy === policy.name);
  return { policy: policy.name, decisionEnd: mean(selected.map(row => row.decisionEnd)), diagnostic: mean(selected.map(row => row.diagnostic)),
    clearedRuns: selected.filter(row => row.cleared).length,
    apparentImprovements: selected.filter(row => row.decisionEnd.objective < rows.find(base => base.seed === row.seed && base.policy === "baseline")!.decisionEnd.objective).length,
    cappedReversals: selected.filter(row => { const base = rows.find(base => base.seed === row.seed && base.policy === "baseline")!;
      return cap > 0 && row.decisionEnd.objective < base.decisionEnd.objective && row.diagnostic.accruedCost > base.diagnostic.accruedCost; }).length };
});
writeFileSync(output, JSON.stringify({ conditions: { engine: ENGINE_VERSION, scenarioVersion: mondayMorningScenario.version, identity: configurationIdentity(mondayMorningScenario),
  seeds: [428193, 428193 + runs - 1], decisionMinutes: 120, clearanceCapMinutes: cap, noFurtherDemandOrActions: true,
  diagnosticRan: cap > 0, diagnosticTerminalHoldAccounting: false, note: cap === 0 ? "Diagnostic not run; diagnostic columns repeat official scores for reference." : "Diagnostic accrued costs exclude official terminal liability to avoid double-counting actual continued waiting. Capped reversals are not full-clearance evidence.", elapsedSeconds: (performance.now() - started) / 1000 }, aggregate, rows }, null, 2));
console.log(`Local report: ${output}`);
