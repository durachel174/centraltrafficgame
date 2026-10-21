import { ENGINE_VERSION, configurationIdentity } from "../src/simulation/logging/Identity";
import { writeFileSync } from "node:fs";
import { SimulationEngine } from "../src/simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../src/simulation/scenarios/MondayMorning";

const runs = Number(process.argv.find(arg => arg.startsWith("--runs="))?.split("=")[1] ?? 10);
const out = process.argv.find(arg => arg.startsWith("--out="))?.slice(6) ?? "/private/tmp/central-traffic-pacing-audit.json";
const rows: any[] = [];
for (let index = 0; index < runs; index++) {
  const seed = 428193 + index;
  const engine = new SimulationEngine(mondayMorningScenario); engine.reset(seed);
  const firstWarning: Record<string, number> = {}, firstOverload: Record<string, number> = {};
  const opportunities: any[] = [];
  let zeroAffected = 0, comparisons = 0;
  while (engine.decisionsOpen()) {
    const observation = engine.getObservation(); const minute = observation.time - mondayMorningScenario.startTime;
    for (const alert of engine.getInfo().alerts) firstWarning[alert.edgeId] ??= minute;
    for (const edge of observation.edges) if (edge.utilization >= 1) firstOverload[edge.id] ??= minute;
    if (minute % 5 === 0) {
      const state = engine.getState();
      for (const id of ["north_bridge", "south_bridge"]) {
        if (!state.alerts.some(alert => alert.edgeId === id)) continue;
        for (const action of [{ type: "REROUTE" as const, targetEdge: id, avoidEdge: id, percentage: 0.25 }, { type: "DELAY_DEPARTURES" as const, targetEdge: id, durationMinutes: 5, percentage: 0.25 }]) {
          const preview = engine.previewAction(action); comparisons++;
          if (!preview.affectedVehicles) zeroAffected++;
          const meaningful = preview.affectedVehicles > 0 && (Math.abs(preview.networkCostDelta) >= 1 || Math.abs(preview.passengerDelayDeltaMinutes) >= 0.1 || preview.forecastChanges.some(change => Math.abs(change.after - change.before) >= 0.01));
          if (meaningful) opportunities.push({ minute, road: id, action: action.type, affected: preview.affectedVehicles, costDelta: preview.networkCostDelta, delayDelta: preview.passengerDelayDeltaMinutes, horizon: preview.horizonMinutes });
        }
      }
    }
    engine.step();
  }
  const times = [...new Set(opportunities.map(row => row.minute))];
  rows.push({ seed, firstWarning, firstOverload, leadTimes: Object.fromEntries(Object.keys(firstWarning).filter(id => firstOverload[id] !== undefined).map(id => [id, firstOverload[id] - firstWarning[id]])),
    comparisons, zeroAffected, firstCandidateMinute: times[0] ?? null, candidateTimeCount: times.length, candidateCount: opportunities.length,
    lowerCostChoices: opportunities.filter(row => row.costDelta < 0).length, unfavorableChoices: opportunities.filter(row => row.costDelta > 0).length,
    gapsMinutes: times.slice(1).map((time, index) => time - times[index]), opportunities });
  console.log(`Pacing seed ${seed}: ${opportunities.length} candidate comparisons, ${zeroAffected} zero-affected`);
}
writeFileSync(out, JSON.stringify({ engine: ENGINE_VERSION, scenarioVersion: mondayMorningScenario.version, identity: configurationIdentity(mondayMorningScenario), definition: "5-minute sampled warning on North/South Bridge with affected>0 and |cost delta|>=1 OR |delay delta|>=0.1 passenger-min OR road utilization change>=1 percentage point. Candidate snapshots are not independent decisions; no-action source trajectory; negative cost is not required.", seeds: [428193, 428193 + runs - 1], rows }, null, 2));
console.log(`Local report: ${out}`);
