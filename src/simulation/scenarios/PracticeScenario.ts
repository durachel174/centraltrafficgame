import type { Scenario } from "../types";
import { mondayMorningScenario } from "./MondayMorning";

export const practiceCheckpointTicks = 10;

const practiceNodeIds = new Set([
  "north_res",
  "north_hill",
  "north_local",
  "north_bridge_in",
  "north_bridge_out",
  "downtown_w",
  "downtown",
  "south_res",
  "south_local",
  "south_bridge_in",
  "south_bridge_out",
  "airport",
  "midtown",
  "west_bypass"
]);

const practiceEdgeIds = new Set([
  "north_feed",
  "north_feed_rev",
  "north_hill_feed",
  "north_hill_feed_rev",
  "north_approach",
  "north_approach_rev",
  "north_bridge",
  "north_bridge_rev",
  "downtown_gate",
  "downtown_gate_rev",
  "downtown_core",
  "downtown_core_rev",
  "south_feed",
  "south_feed_rev",
  "south_approach",
  "south_approach_rev",
  "south_bridge",
  "south_bridge_rev",
  "airport_link",
  "airport_link_rev",
  "midtown_south",
  "midtown_south_rev",
  "midtown_downtown",
  "midtown_downtown_rev",
  "bypass_north",
  "bypass_north_rev",
  "bypass_south",
  "bypass_south_rev"
]);

export const practiceScenario: Scenario = {
  ...mondayMorningScenario,
  evaluation: undefined,
  id: "practice_reroute",
  terminalHoldAccounting: false,
  name: "Practice: North Bridge Pressure",
  seed: 90210,
  startTime: 7 * 60,
  endTime: 7 * 60 + 45,
  graph: {
    nodes: mondayMorningScenario.graph.nodes.filter((node) => practiceNodeIds.has(node.id)).map((node) => ({ ...node })),
    edges: mondayMorningScenario.graph.edges.filter((edge) => practiceEdgeIds.has(edge.id)).map((edge) => ({
      ...edge,
      comfortableCapacity:
        edge.id === "north_bridge" ? 44 : edge.id === "north_approach" ? 48 : edge.id === "south_bridge" ? 145 : edge.comfortableCapacity,
      maximumCapacity:
        edge.id === "north_bridge" ? 90 : edge.id === "north_approach" ? 96 : edge.id === "south_bridge" ? 225 : edge.maximumCapacity
    }))
  },
  demand: {
    curve: [
      { minute: 0, tripsPerMinute: 14 },
      { minute: 10, tripsPerMinute: 24 },
      { minute: 24, tripsPerMinute: 28 },
      { minute: 36, tripsPerMinute: 20 },
      { minute: 45, tripsPerMinute: 10 }
    ],
    pairs: [
      { origin: "north_res", destination: "downtown", weight: 44 },
      { origin: "north_hill", destination: "downtown", weight: 24 },
      { origin: "north_res", destination: "airport", weight: 10 },
      { origin: "south_res", destination: "downtown", weight: 12 },
      { origin: "south_res", destination: "airport", weight: 10 }
    ],
    passengerTolerance: [16, 30]
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
