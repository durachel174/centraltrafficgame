import { useGameStore } from "../game/GameStore";
import { formatClock } from "../game/ScenarioProgress";
import type { SimulationAction } from "../simulation/types";

export function describeAction(action: SimulationAction, roadName: (id: string) => string): string {
  switch (action.type) {
    case "REROUTE": return `Reroute ${action.percentage * 100}% from ${roadName(action.targetEdge)}${action.avoidEdge && action.avoidEdge !== action.targetEdge ? `, avoiding ${roadName(action.avoidEdge)}` : ""}`;
    case "DELAY_DEPARTURES": return `Hold ${action.percentage * 100}% for ${action.durationMinutes} min · ${action.targetEdge ? roadName(action.targetEdge) : "eligible waiting trips"}${action.origin ? ` from ${action.origin}` : ""}${action.destination ? ` to ${action.destination}` : ""}`;
    case "RELEASE_DEPARTURES": return `Release holds · ${action.targetEdge ? roadName(action.targetEdge) : "eligible waiting trips"}${action.origin ? ` from ${action.origin}` : ""}${action.destination ? ` to ${action.destination}` : ""}`;
    case "DEBUG_SPAWN": return `Debug spawn ${action.count}`;
    case "DEBUG_INCIDENT": return `Debug restriction · ${roadName(action.edgeId)} · ${action.capacityModifier * 100}% capacity for ${action.durationMinutes} min`;
    case "DEBUG_CLEAR_INCIDENT": return `Debug clear restriction · ${roadName(action.edgeId)}`;
    case "ROUTE_GROUP": return `Send ${action.groupId} via ${action.corridorId}`;
    case "HOLD_GROUP": return `Hold ${action.groupId} for ${action.durationMinutes} min`;
    case "NO_OP": return "No intervention";
  }
}

export function DecisionHistory() {
  const { decisionHistory, scenario, replay } = useGameStore();
  const name = (id: string) => scenario.graph.edges.find(edge => edge.id === id)?.name ?? id;
  return <details className="panel decisionHistory">
    <summary>{replay ? "Replay decisions" : "Decision history"} ({decisionHistory.length})</summary>
    <p>Immediate tick cost change includes traffic evolution during that interval. It does not establish long-term action impact. Lower cost is better.</p>
    {!decisionHistory.length && <p>No applied interventions yet. Canceled previews are not decisions.</p>}
    <ol>{decisionHistory.map(entry => <li key={entry.stateSnapshotId}>
      <strong>{formatClock(scenario.startTime + entry.simulationTime - 0.25)} · {describeAction(entry.action, name)}</strong>
      <span>{entry.affectedCount ?? "Unavailable"} actually affected · immediate tick system-cost change {(-entry.immediateReward).toFixed(1)} cost units</span>
    </li>)}</ol>
  </details>;
}
