import { SimulationEngine } from "../src/simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../src/simulation/scenarios/MondayMorning";

const engine = new SimulationEngine(mondayMorningScenario);
engine.reset(428193);
engine.step({ type: "DEBUG_SPAWN", count: 5000 });

const ticks = 200;
const start = performance.now();
for (let i = 0; i < ticks; i++) engine.step({ type: "NO_OP" });
const elapsed = performance.now() - start;

const previewRuns = 20;
const previewStart = performance.now();
for (let i = 0; i < previewRuns; i++) {
  engine.previewAction({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage: 0.25 });
}
const previewElapsed = performance.now() - previewStart;

const forecastRefresh = new SimulationEngine(mondayMorningScenario);
forecastRefresh.reset(428193);
forecastRefresh.step({ type: "DEBUG_SPAWN", count: 5000 });
const forecastStart = performance.now();
forecastRefresh.step({ type: "DEBUG_INCIDENT", edgeId: "north_bridge", capacityModifier: 0.6, durationMinutes: 15 });
const forecastElapsed = performance.now() - forecastStart;

console.log(`Active vehicles: ${engine.getState().metrics.activeTrips}`);
console.log(`Ticks: ${ticks}`);
console.log(`Tick duration: ${(elapsed / ticks).toFixed(3)} ms`);
console.log(`Simulation ticks/sec: ${(ticks / (elapsed / 1000)).toFixed(1)}`);
console.log(`Preview runs: ${previewRuns}`);
console.log(`Preview duration: ${(previewElapsed / previewRuns).toFixed(3)} ms`);
console.log(`Forecast refresh duration: ${forecastElapsed.toFixed(3)} ms`);
console.log("Render FPS: not measured by this headless benchmark");
