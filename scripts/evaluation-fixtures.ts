// Reproducible local browser/replay fixtures on the real Monday scenario, not new scenarios.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SimulationEngine } from "../src/simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../src/simulation/scenarios/MondayMorning";
import { createCompletedRun } from "../src/simulation/logging/RunFile";
const out = process.argv.find(arg => arg.startsWith("--out="))?.slice(6) ?? "/private/tmp/central-traffic-evaluation-fixtures";
mkdirSync(out, { recursive: true });
for (const incomplete of [false, true]) {
  const engine = new SimulationEngine(mondayMorningScenario, undefined, true); engine.reset(428193);
  while (!engine.isDone()) {
    const time = engine.getState().time;
    engine.step(incomplete && time === 119.75 ? { type: "DELAY_DEPARTURES", percentage: 1, durationMinutes: 1440 }
      : !incomplete && time === 30 ? { type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: .25 } : { type: "NO_OP" });
  }
  const path = join(out, incomplete ? "incomplete.json" : "complete.json");
  writeFileSync(path, JSON.stringify(createCompletedRun(engine), null, 2));
  console.log(`${path}: ${engine.getEvaluation().finishReason}; ${engine.getState().metrics.activeTrips} active, ${engine.getState().metrics.waitingTrips} waiting`);
}
