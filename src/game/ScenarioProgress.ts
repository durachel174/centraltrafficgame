import type { Scenario, SimulationObservation } from "../simulation/types";

export const formatClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`;

export function scenarioProgress(scenario: Scenario, observation: SimulationObservation, activeEventIds: string[]) {
  const elapsed = observation.time - scenario.startTime;
  const active = scenario.events.filter(event => activeEventIds.includes(event.id));
  // Event state describes the interval just simulated, so capacity may restore one observation
  // after the scheduled boundary. Show the actual edge modifier as well as scheduled time.
  const ended = scenario.events.filter(event => elapsed >= event.time + event.duration && !activeEventIds.includes(event.id));
  const done = observation.evaluation?.phase === "finished";
  const stage = done ? (observation.evaluation.finishReason === "safety-limit" ? "Evaluation incomplete" : "Scenario complete") : observation.evaluation?.phase === "clearance" ? "Clearance" : active.length ? "Bridge incident" : ended.length ? "Recovery"
    : elapsed >= (scenario.progression?.rushHourMinute ?? Infinity) ? "Rush hour" : "Morning commute building";
  const incidents = active.map(event => ({
    ...event,
    roadName: scenario.graph.edges.find(edge => edge.id === event.edgeId)?.name ?? event.edgeId,
    start: formatClock(scenario.startTime + event.time),
    restoration: formatClock(scenario.startTime + event.time + event.duration),
    remaining: Math.max(0, event.time + event.duration - elapsed),
    currentModifier: observation.edges.find(edge => edge.id === event.edgeId)?.capacityModifier ?? 1
  }));
  const restored = ended.map(event => ({
    ...event,
    roadName: scenario.graph.edges.find(edge => edge.id === event.edgeId)?.name ?? event.edgeId,
    currentModifier: observation.edges.find(edge => edge.id === event.edgeId)?.capacityModifier ?? 1,
    restoration: formatClock(scenario.startTime + event.time + event.duration)
  }));
  return { stage, incidents, restored };
}
