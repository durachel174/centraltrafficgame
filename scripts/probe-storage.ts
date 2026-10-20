import { writeFileSync } from "node:fs";
import { SimulationEngine } from "../src/simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../src/simulation/scenarios/MondayMorning";
import { ENGINE_VERSION } from "../src/simulation/logging/Identity";
import type { Scenario } from "../src/simulation/types";
const scenario: Scenario = { ...mondayMorningScenario, id: "isolated-storage-probe", startTime: 0, endTime: 360, events: [], terminalHoldAccounting: false,
  graph: { nodes: [{ id: "o", x: 0, y: 0, type: "origin" }, { id: "d", x: 1, y: 0, type: "destination" }],
    edges: [{ id: "road", from: "o", to: "d", lengthKm: 1, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 20 }] },
  demand: { curve: [{ minute: 0, tripsPerMinute: 0 }], pairs: [{ origin: "o", destination: "d", weight: 1 }], passengerTolerance: [20, 20] } };
const e = new SimulationEngine(scenario, undefined, true); e.reset(7); e.step({ type: "DEBUG_SPAWN", count: 100 });
const first = { ...e.getState(), graph: e.exportSnapshot().graph }, series = [];
while (!e.isDone() && e.getObservation().activeTrips + e.getObservation().waitingTrips) {
  e.step(); if (e.getObservation().time % 10 === 0) series.push({ ...e.getState(), graph: e.exportSnapshot().graph });
}
const final = { ...e.getState(), graph: e.exportSnapshot().graph };
const report = { engine: ENGINE_VERSION, fixture: scenario, first, final, cleared: final.metrics.tripsCompleted === 100, series };
const out = process.argv.find(v => v.startsWith("--out="))?.slice(6) ?? "/private/tmp/storage-probe.json";
writeFileSync(out, JSON.stringify(report, null, 2)); console.log(out);
