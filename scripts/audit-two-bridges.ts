import { SimulationEngine } from "../src/simulation/core/SimulationEngine";
import { twoBridgesScenario as scenario } from "../src/simulation/scenarios/TwoBridges";
import { configurationIdentity, engineVersionFor } from "../src/simulation/logging/Identity";
import { writeFileSync } from "node:fs";
const names = ["no-intervention", "north", "south", "alternate", "restriction-south", "long-hold"];
const results = [];
for (const seed of [428193, 428194, 428195])
    for (const policy of names) {
        const engine = new SimulationEngine(scenario, undefined, true);
        engine.reset(seed);
        let peakNorth = 0, peakSouth = 0, northQueuedMinutes = 0, northPressure = 0;
        const opportunities: {
            group: string;
            at: number;
            size: number;
        }[] = [];
        const observed = new Set<string>();
        while (!engine.isDone()) {
            const s = engine.getState(), trip = s.waiting.find(t => t.groupId && !t.groupDecided);
            let action: Parameters<typeof engine.step>[0] = { type: "NO_OP" };
            if (trip && engine.decisionsOpen() && !observed.has(trip.groupId!)) {
                const id = trip.groupId!, batch = scenario.demand.batches!.find(b => b.id === id)!;
                observed.add(id);
                opportunities.push({ group: id, at: s.time, size: s.waiting.filter(t => t.groupId === id).length });
                if (policy === "long-hold")
                    action = { type: "HOLD_GROUP", groupId: id, durationMinutes: 90 };
                else if (policy !== "no-intervention")
                    action = { type: "ROUTE_GROUP", groupId: id, corridorId: policy === "south" || (policy === "alternate" && batch.at % 64 === 32) || (policy === "restriction-south" && batch.at >= 32 && batch.at <= 96) ? "south" : "north" };
            }
            engine.step(action);
            const north = engine.graph.edge("north_bridge");
            northPressure += Math.max(0, north.currentVehicleCount / (north.comfortableCapacity * north.capacityModifier) - 1) * .25;
            peakNorth = Math.max(peakNorth, engine.graph.edge("north_bridge").currentVehicleCount);
            peakSouth = Math.max(peakSouth, engine.graph.edge("south_bridge").currentVehicleCount);
            if (engine.getState().vehicles.some(v => v.status === "traveling" && v.route[v.currentEdgeIndex] === "north_bridge" && v.edgeProgress === 1))
                northQueuedMinutes += .25;
        }
        const s = engine.getState(), arrived = s.vehicles.filter(v => v.status === "arrived"), delay = arrived.reduce((sum, v) => sum + Math.max(0, v.actualArrivalTime! - v.requestedDepartureTime - v.baselineTravelTime), 0) / Math.max(1, arrived.length);
        results.push({ seed, policy, finish: engine.getEvaluation(), cost: s.metrics.objective, arrived: arrived.length, byDeadline: arrived.filter(v => v.actualArrivalTime! <= scenario.departureGroups!.arrivalDeadline - scenario.startTime).length, waiting: s.metrics.waitingTrips, active: s.metrics.activeTrips, averageCompletedDelayMinutes: delay, peakNorth, peakSouth, northQueuedMinutes, northPressureVehicleRatioMinutes: northPressure, intended1xSeconds: s.time, opportunities });
    }
const path = process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? '/private/tmp/two-bridges-audit.json';
writeFileSync(path, JSON.stringify({ scenario: scenario.id, version: scenario.version, engine: engineVersionFor(scenario), identity: configurationIdentity(scenario), defaultSpeed: 1, tickSimulatedMinutes: .25, tickWallMilliseconds: 250, results }, null, 2));
console.table(results.map(({ opportunities, finish, ...r }) => ({ ...r, finish: finish.finishReason })));
console.log(path);
