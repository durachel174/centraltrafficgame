import type { Scenario } from "../types";

const nodes = [
  { id: "north_res", x: 120, y: 115, type: "origin", district: "NORTH RESIDENTIAL" },
  { id: "north_local", x: 230, y: 150, type: "intersection", district: "NORTH RESIDENTIAL" },
  { id: "north_bridge_in", x: 360, y: 190, type: "bridgeEntrance", district: "NORTH RESIDENTIAL" },
  { id: "north_bridge_out", x: 535, y: 245, type: "bridgeExit", district: "DOWNTOWN" },
  { id: "downtown_w", x: 650, y: 250, type: "intersection", district: "DOWNTOWN" },
  { id: "downtown", x: 760, y: 290, type: "destination", district: "DOWNTOWN" },
  { id: "entertainment", x: 770, y: 145, type: "destination", district: "ENTERTAINMENT" },
  { id: "south_res", x: 150, y: 520, type: "origin", district: "SOUTH RESIDENTIAL" },
  { id: "south_local", x: 275, y: 505, type: "intersection", district: "SOUTH RESIDENTIAL" },
  { id: "south_bridge_in", x: 405, y: 465, type: "bridgeEntrance", district: "SOUTH RESIDENTIAL" },
  { id: "south_bridge_out", x: 585, y: 420, type: "bridgeExit", district: "AIRPORT" },
  { id: "airport", x: 815, y: 485, type: "destination", district: "AIRPORT" },
  { id: "midtown", x: 575, y: 340, type: "intersection", district: "DOWNTOWN" },
  { id: "east_loop", x: 900, y: 320, type: "intersection", district: "DOWNTOWN" },
  { id: "west_bypass", x: 350, y: 335, type: "intersection", district: "CROSS-BAY" },
  { id: "event_park", x: 680, y: 95, type: "destination", district: "ENTERTAINMENT" },
  { id: "north_hill", x: 95, y: 245, type: "origin", district: "NORTH RESIDENTIAL" },
  { id: "south_industrial", x: 105, y: 405, type: "origin", district: "SOUTH RESIDENTIAL" },
  { id: "harbor", x: 675, y: 575, type: "destination", district: "AIRPORT" },
  { id: "civic", x: 850, y: 220, type: "destination", district: "DOWNTOWN" }
] as const;

const twoWay = (
  id: string,
  from: string,
  to: string,
  lengthKm: number,
  speedLimitKph: number,
  comfortableCapacity: number,
  maximumCapacity: number,
  name?: string,
  major = false
) => [
  { id, from, to, lengthKm, speedLimitKph, comfortableCapacity, maximumCapacity, name, major },
  { id: `${id}_rev`, from: to, to: from, lengthKm, speedLimitKph, comfortableCapacity, maximumCapacity, name: name ? `${name} Reverse` : undefined, major }
];

const edges = [
  ...twoWay("north_feed", "north_res", "north_local", 2.2, 48, 70, 120, "North Residential Arterial"),
  ...twoWay("north_hill_feed", "north_hill", "north_local", 2.8, 44, 58, 105, "North Hill Connector"),
  ...twoWay("north_approach", "north_local", "north_bridge_in", 2.5, 55, 82, 150, "North Bridge Approach", true),
  ...twoWay("north_bridge", "north_bridge_in", "north_bridge_out", 4.8, 78, 94, 170, "North Bridge", true),
  ...twoWay("downtown_gate", "north_bridge_out", "downtown_w", 1.9, 45, 80, 145, "Downtown Gate", true),
  ...twoWay("downtown_core", "downtown_w", "downtown", 1.5, 35, 52, 100, "Downtown Core"),
  ...twoWay("entertainment_link", "downtown_w", "entertainment", 2.8, 42, 45, 90, "Entertainment Link"),
  ...twoWay("park_link", "entertainment", "event_park", 1.4, 30, 32, 70, "Event Park Link"),
  ...twoWay("south_feed", "south_res", "south_local", 2.5, 48, 66, 120, "South Residential Arterial"),
  ...twoWay("industrial_feed", "south_industrial", "south_local", 2.2, 46, 55, 100, "Industrial Connector"),
  ...twoWay("south_approach", "south_local", "south_bridge_in", 2.8, 58, 78, 145, "South Bridge Approach", true),
  ...twoWay("south_bridge", "south_bridge_in", "south_bridge_out", 7.4, 82, 120, 205, "South Bridge", true),
  ...twoWay("airport_link", "south_bridge_out", "airport", 3.2, 62, 82, 150, "Airport Link", true),
  ...twoWay("harbor_link", "south_bridge_out", "harbor", 2.6, 48, 56, 110, "Harbor Link"),
  ...twoWay("midtown_north", "north_bridge_out", "midtown", 2.0, 40, 62, 115, "Midtown North"),
  ...twoWay("midtown_south", "south_bridge_out", "midtown", 2.7, 50, 76, 130, "Midtown South"),
  ...twoWay("midtown_downtown", "midtown", "downtown", 2.1, 42, 60, 115, "Midtown Downtown"),
  ...twoWay("bypass_north", "north_bridge_in", "west_bypass", 3.0, 55, 54, 100, "West Bypass North"),
  ...twoWay("bypass_south", "west_bypass", "south_bridge_in", 3.3, 55, 54, 100, "West Bypass South"),
  ...twoWay("east_loop", "downtown", "east_loop", 2.2, 46, 55, 110, "East Loop"),
  ...twoWay("civic_loop", "east_loop", "civic", 1.7, 35, 42, 90, "Civic Loop"),
  ...twoWay("airport_east", "airport", "east_loop", 4.3, 64, 65, 125, "Airport East")
];

export const mondayMorningScenario: Scenario = {
  id: "monday_morning",
  name: "Monday Morning",
  seed: 428193,
  startTime: 7 * 60,
  endTime: 9 * 60,
  graph: { nodes: nodes as any, edges },
  demand: {
    curve: [
      { minute: 0, tripsPerMinute: 8 },
      { minute: 15, tripsPerMinute: 11 },
      { minute: 30, tripsPerMinute: 22 },
      { minute: 45, tripsPerMinute: 35 },
      { minute: 60, tripsPerMinute: 54 },
      { minute: 75, tripsPerMinute: 68 },
      { minute: 90, tripsPerMinute: 49 },
      { minute: 105, tripsPerMinute: 28 },
      { minute: 120, tripsPerMinute: 8 }
    ],
    pairs: [
      { origin: "north_res", destination: "downtown", weight: 30 },
      { origin: "north_hill", destination: "downtown", weight: 18 },
      { origin: "north_res", destination: "airport", weight: 8 },
      { origin: "south_res", destination: "downtown", weight: 22 },
      { origin: "south_industrial", destination: "downtown", weight: 12 },
      { origin: "south_res", destination: "airport", weight: 10 },
      { origin: "north_res", destination: "entertainment", weight: 5 },
      { origin: "south_industrial", destination: "harbor", weight: 7 }
    ],
    passengerTolerance: [12, 28]
  },
  events: [
    {
      id: "north_bridge_incident",
      time: 72,
      duration: 15,
      type: "CAPACITY_REDUCTION",
      edgeId: "north_bridge",
      capacityModifier: 0.6,
      title: "Incident: North Bridge capacity reduced 40%"
    }
  ],
  objectiveWeights: {
    travelTime: 1,
    congestion: 95,
    departureDelay: 2.2,
    dissatisfaction: 1.7,
    excessDistance: 0.9
  },
  congestion: { alpha: 0.15, beta: 4, utilizationThreshold: 0.82 },
  satisfaction: { departureDelay: 0.8, lateDelay: 1.2, reroute: 1.6 }
};
