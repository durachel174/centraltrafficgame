import type { Scenario } from "../types";
import { mondayMorningScenario } from "./MondayMorning";

export const practiceCheckpointTicks = 16;

export const practiceScenario: Scenario = {
  ...mondayMorningScenario,
  id: "practice_reroute",
  name: "Practice: North Bridge Pressure",
  seed: 90210,
  startTime: 7 * 60,
  endTime: 7 * 60 + 35,
  graph: {
    nodes: mondayMorningScenario.graph.nodes.map((node) => ({ ...node })),
    edges: mondayMorningScenario.graph.edges.map((edge) => ({
      ...edge,
      comfortableCapacity:
        edge.id === "north_bridge" ? 48 : edge.id === "north_approach" ? 50 : edge.id === "south_bridge" ? 150 : edge.comfortableCapacity,
      maximumCapacity:
        edge.id === "north_bridge" ? 96 : edge.id === "north_approach" ? 100 : edge.id === "south_bridge" ? 230 : edge.maximumCapacity
    }))
  },
  demand: {
    curve: [
      { minute: 0, tripsPerMinute: 34 },
      { minute: 8, tripsPerMinute: 44 },
      { minute: 18, tripsPerMinute: 36 },
      { minute: 35, tripsPerMinute: 18 }
    ],
    pairs: [
      { origin: "north_res", destination: "downtown", weight: 48 },
      { origin: "north_hill", destination: "downtown", weight: 28 },
      { origin: "north_res", destination: "airport", weight: 12 },
      { origin: "south_res", destination: "downtown", weight: 8 },
      { origin: "south_res", destination: "airport", weight: 4 }
    ],
    passengerTolerance: [12, 24]
  },
  events: [],
  forecast: {
    ...mondayMorningScenario.forecast!,
    refreshIntervalMinutes: 1,
    warningUtilization: 0.75,
    criticalUtilization: 1.05,
    previewHorizonMinutes: 5
  }
};
