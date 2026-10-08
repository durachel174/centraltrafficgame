import { SimulationEngine } from "../src/simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../src/simulation/scenarios/MondayMorning";

const engine = new SimulationEngine(mondayMorningScenario);
engine.reset(428193);
engine.step({ type: "DEBUG_SPAWN", count: 5000 });

const ticks = 200;
const start = performance.now();
for (let i = 0; i < ticks; i++) engine.step({ type: "NO_OP" });
const elapsed = performance.now() - start;

console.log(`Active vehicles: ${engine.getState().metrics.activeTrips}`);
console.log(`Ticks: ${ticks}`);
console.log(`Tick duration: ${(elapsed / ticks).toFixed(3)} ms`);
console.log(`Simulation ticks/sec: ${(ticks / (elapsed / 1000)).toFixed(1)}`);
