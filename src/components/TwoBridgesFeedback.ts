import type { Scenario, TripRequest, Vehicle } from "../simulation/types";
import { formatClock } from "../game/ScenarioProgress";

export function crossingGoal(scenario: Scenario) {
    const total = scenario.demand.batches!.reduce((n, b) => n + b.size, 0);
    const target = scenario.departureGroups!.arrivalTarget ?? total;
    return { total, target, text: `${target} of ${total} commuters at Bay Works by ${formatClock(scenario.departureGroups!.arrivalDeadline)}` };
}

export function groupEligibility(trips: TripRequest[], time: number) {
    const eligible = trips.filter(t => Math.max(t.availableAt ?? t.requestedDepartureTime, t.heldUntil ?? 0) <= time).length;
    const remaining = Math.max(0, Math.min(...trips.map(t => Math.max(t.availableAt ?? t.requestedDepartureTime, t.heldUntil ?? 0))) - time);
    return eligible ? `${eligible} eligible now · queued for road entry`
        : `Automatic eligibility in ${Number.isFinite(remaining) ? remaining.toFixed(2) : "0.00"} simulated min`;
}

// A small presentation snapshot, never a simulation input or replay event.
export function trafficPresentation(vehicles: Vehicle[], scenario: Scenario) {
    const arrivals = vehicles.filter(v => v.status === "arrived").length;
    const queues = vehicles.filter(v => v.status === "traveling" && v.edgeProgress === 1).length;
    const entered = new Set<string>();
    for (const v of vehicles) for (const c of scenario.departureGroups!.corridors) {
        const index = v.route.indexOf(c.viaEdge);
        if (v.groupId && index >= 0 && (v.status === "arrived" || v.currentEdgeIndex >= index)) entered.add(`${v.groupId}:${c.id}`);
    }
    return { arrivals, queues, entered };
}
export type TrafficPresentation = ReturnType<typeof trafficPresentation>;
export function trafficTransitions(before: TrafficPresentation, after: TrafficPresentation, scenario: Scenario) {
    const messages: string[] = [];
    const arrivals = Math.max(0, after.arrivals - before.arrivals);
    if (arrivals) messages.push(`+${arrivals} reached Bay Works`);
    for (const key of after.entered) if (!before.entered.has(key)) {
        const [group, corridor] = key.split(":");
        messages.push(`${scenario.demand.batches!.find(b => b.id === group)?.label ?? group} entering ${corridor === "north" ? "North" : "South"} Bridge`);
    }
    const queueDelta = after.queues - before.queues;
    if (queueDelta) messages.push(`Exit queues ${queueDelta > 0 ? "grew" : "shrank"} by ${Math.abs(queueDelta)} · ${after.queues} now`);
    return { arrivals, messages };
}
