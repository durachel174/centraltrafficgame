import type { SimulationAction } from "../src/simulation/types";
import type { SimulationEngine } from "../src/simulation/core/SimulationEngine";
export type Policy = { name: string; decide: (tick: number, engine: SimulationEngine) => SimulationAction };
const none: SimulationAction = { type: "NO_OP" };
const reroute = (percentage: number): SimulationAction => ({ type: "REROUTE", targetEdge: "north_bridge", avoidEdge: "north_bridge", percentage });
const hold = (percentage: number, durationMinutes: number): SimulationAction => ({ type: "DELAY_DEPARTURES", percentage, durationMinutes });
export const policies: Policy[] = [
  { name: "late-day-hold-at-119.75", decide: tick => tick === 479 ? hold(1, 1440) : none },
  { name: "baseline", decide: () => none },
  { name: "reactive", decide: () => none },
  { name: "repeated-hold-25-5m", decide: tick => tick % 4 === 0 ? hold(0.25, 5) : none },
  { name: "extended-hold-100-120m", decide: tick => tick % 20 === 0 ? hold(1, 120) : none },
  { name: "repeated-reroute-25", decide: tick => tick % 20 === 0 ? reroute(0.25) : none },
  { name: "repeated-reroute-100", decide: tick => tick % 20 === 0 ? reroute(1) : none },
  ...[90, 105, 115].flatMap(minute => [0.25, 1].map(percentage => ({ name: `late-reroute-${percentage * 100}-at-${minute}`, decide: (tick: number) => tick === minute * 4 ? reroute(percentage) : none }))),
  { name: "combined-25-from-90", decide: tick => tick < 360 ? none : tick % 4 === 0 ? hold(0.25, 5) : tick % 4 === 1 ? reroute(0.25) : none },
  { name: "combined-100-extended-from-105", decide: tick => tick < 420 ? none : tick % 4 === 0 ? hold(1, 120) : tick % 4 === 1 ? reroute(1) : none }
];
