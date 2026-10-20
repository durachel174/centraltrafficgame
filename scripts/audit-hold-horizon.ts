import { writeFileSync } from "node:fs";
import { SimulationEngine } from "../src/simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../src/simulation/scenarios/MondayMorning";
const out = process.argv.find(arg => arg.startsWith("--out="))?.slice(6) ?? "/private/tmp/central-traffic-hold-horizon.json";
const scoringScenario = process.argv.includes("--legacy-cutoff") ? { ...mondayMorningScenario, terminalHoldAccounting: false } : mondayMorningScenario;
const runs = Number(process.argv.find(arg => arg.startsWith("--runs="))?.split("=")[1] ?? 10);
const rows: any[] = [];
for (let index = 0; index < runs; index++) {
  const seed = 428193 + index;
  const result = (duration: number | null) => {
    const engine = new SimulationEngine(scoringScenario, undefined, true); engine.reset(seed);
    for (let tick = 0; !engine.isDone(); tick++) engine.step(duration !== null && tick >= 460 ? { type: "DELAY_DEPARTURES", percentage: 1, durationMinutes: duration } : { type: "NO_OP" });
    const state = engine.getState();
    return { cost: state.metrics.objective, completed: state.metrics.tripsCompleted, active: state.metrics.activeTrips, waiting: state.metrics.waitingTrips,
      observedWaitingPassengerMinutes: state.metrics.departureDelay, committedWaitingBeyondEnd: state.waiting.reduce((sum, trip) => sum + Math.max(0, (trip.heldUntil ?? state.time) - state.time), 0), components: state.metrics.objectiveBreakdown };
  };
  rows.push({ seed, baseline: result(null), short: result(5), day: result(1440) });
}
writeFileSync(out, JSON.stringify({ definition: "Same-seed no-action versus 100% waiting hold every tick during final 5 decision minutes, duration 5 vs 1440. Only the contractual post-end hold differs between short/day; both impose identical dispatch suppression before 09:00.", rows }, null, 2));
console.log(JSON.stringify(rows.map(row => ({ seed: row.seed, baseline: row.baseline.cost, short: row.short.cost, day: row.day.cost, extraCommittedMinutes: row.day.committedWaitingBeyondEnd - row.short.committedWaitingBeyondEnd })), null, 2));
