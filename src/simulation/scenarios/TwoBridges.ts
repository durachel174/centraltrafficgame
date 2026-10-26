import type { Scenario } from "../types";
/** Deliberately separate from Monday Morning. All times are simulated minutes. */
export const twoBridgesScenario: Scenario = {
    id: "two_bridges_one_rush", name: "Two Bridges, One Rush", version: 1, seed: 428193,
    startTime: 420, endTime: 600, evaluation: { maxClearanceMinutes: 180 },
    departureGroups: { version: 1, arrivalDeadline: 640, corridors: [
            { id: "north", label: "North · short, limited space", viaEdge: "north_bridge" },
            { id: "south", label: "South · longer, more space", viaEdge: "south_bridge" }
        ] },
    graph: {
        nodes: [
            { id: "cedar", x: 155, y: 125, type: "origin", district: "CEDAR HILL" },
            { id: "linden", x: 155, y: 245, type: "origin", district: "LINDEN PARK" },
            { id: "north_in", x: 390, y: 100, type: "bridgeEntrance" },
            { id: "north_out", x: 640, y: 100, type: "bridgeExit" },
            { id: "south_in", x: 390, y: 270, type: "bridgeEntrance" },
            { id: "south_out", x: 640, y: 270, type: "bridgeExit" },
            { id: "work", x: 835, y: 185, type: "destination", district: "BAY WORKS" }
        ],
        edges: [
            ...["cedar", "linden"].flatMap(origin => ["north", "south"].map(corridor => ({
                id: `${origin}_${corridor}`, from: origin, to: `${corridor}_in`, lengthKm: 1, speedLimitKph: 60,
                comfortableCapacity: 50, maximumCapacity: 80, name: `${origin === "cedar" ? "Cedar" : "Linden"} approach`
            }))),
            { id: "north_bridge", name: "North Bridge", from: "north_in", to: "north_out", lengthKm: 4, speedLimitKph: 60, comfortableCapacity: 10, maximumCapacity: 18, major: true },
            { id: "south_bridge", name: "South Bridge", from: "south_in", to: "south_out", lengthKm: 12, speedLimitKph: 60, comfortableCapacity: 25, maximumCapacity: 42, major: true },
            ...["north", "south"].map(c => ({ id: `${c}_work`, from: `${c}_out`, to: "work", lengthKm: 2, speedLimitKph: 60, comfortableCapacity: 70, maximumCapacity: 120, name: "To Bay Works" }))
        ]
    },
    demand: {
        curve: [{ minute: 0, tripsPerMinute: 0 }, { minute: 180, tripsPerMinute: 0 }],
        pairs: [{ origin: "cedar", destination: "work", weight: 1 }], passengerTolerance: [18, 30],
        batches: [0, 32, 64, 96, 128, 160].map((at, index) => ({ id: `group_${index + 1}`, label: ["Early birds", "Workshop crew", "Studio team", "Office wave", "Market crew", "Late starters"][index], at, size: 50, origin: index % 2 ? "linden" : "cedar", destination: "work", decisionMinutes: 12 }))
    },
    events: [{ id: "north_works", type: "CAPACITY_REDUCTION", time: 55, duration: 65, edgeId: "north_bridge", capacityModifier: .65, title: "North Bridge maintenance: 35% less capacity" }],
    objectiveWeights: { travelTime: 1, congestion: 8, departureDelay: 2.2, dissatisfaction: 1.4, excessDistance: 3 },
    congestion: { alpha: .15, beta: 4, utilizationThreshold: .82 },
    satisfaction: { departureDelay: .8, lateDelay: 1, reroute: 1.8 },
    forecast: { horizonsMinutes: [5, 10, 15], previewHorizonMinutes: 15, refreshIntervalMinutes: 3, warningUtilization: 1, criticalUtilization: 1.5 }
};
