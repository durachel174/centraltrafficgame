import { useGameStore } from "../game/GameStore";
import type { ForecastDelta } from "../simulation/types";

// Each road occupies one summary row, ranked by its largest absolute utilization change.
export function rankRoadChanges(changes: ForecastDelta[], selectedEdgeId: string | null) {
  const strongest = new Map<string, ForecastDelta>();
  for (const change of changes) {
    if (change.edgeId === selectedEdgeId || Math.abs(change.after - change.before) <= 0.01) continue;
    const previous = strongest.get(change.edgeId);
    if (!previous || Math.abs(change.after - change.before) > Math.abs(previous.after - previous.before)) strongest.set(change.edgeId, change);
  }
  return [...strongest.values()].sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before) || a.edgeId.localeCompare(b.edgeId));
}

export function PreviewReview() {
  const { engine, preview, tutorial, requestPreview, confirmPreview, cancelPreview } = useGameStore();
  if (preview.status === "idle") return null;
  const result = preview.result;
  const action = preview.action;
  const graph = engine.getState().graph;
  const roadName = (id: string) => graph.edges.get(id)?.name ?? id.replaceAll("_", " ");
  const actionLabel = action?.type === "REROUTE" ? `Reroute ${action.percentage * 100}%`
    : action?.type === "DELAY_DEPARTURES" ? `Hold ${(action.percentage ?? 1) * 100}% of eligible waiting trips for ${action.durationMinutes} min`
    : action?.type.replaceAll("_", " ") ?? "Action";
  const selected = result?.forecastChanges.find(change => change.edgeId === preview.targetEdgeId && Math.abs(change.actualHorizonMinutes - result.horizonMinutes) < 0.000001)
    ?? result?.forecastChanges.find(change => change.edgeId === preview.targetEdgeId && change.requestedHorizonMinutes === result.requestedHorizonMinutes);
  const others = rankRoadChanges(result?.forecastChanges ?? [], preview.targetEdgeId).slice(0, 3);
  const utilization = (change: ForecastDelta) => `${(change.before * 100).toFixed(0)}% -> ${(change.after * 100).toFixed(0)}%`;
  const horizon = (change: ForecastDelta) => `+${change.actualHorizonMinutes} min${change.truncated ? " (scenario end)" : ""}`;
  return (
    <div className={`previewDialog ${tutorial.active && tutorial.step === "review" ? "tutorialTarget" : ""}`} aria-label="Action review" aria-live="polite">
      <strong>{actionLabel} on {preview.targetEdgeId ? roadName(preview.targetEdgeId) : "network"}</strong>
      <p>Projected effects versus no action, assuming no further intervention. These are projections, not observed outcomes.</p>
      {preview.status === "loading" && <p>Calculating preview...</p>}
      {preview.status === "error" && <p>{preview.error ?? "Preview failed."}</p>}
      {preview.status === "stale" && <p>Simulation changed. Recompute before applying.</p>}
      {preview.status === "ready" && result && <>
        <div className="statGrid">
          <span>Actual affected trips</span><strong>{result.affectedVehicles}</strong>
          <span>This road utilization</span><strong>{selected ? utilization(selected) : "Unavailable"}</strong>
          <span>Passenger-delay delta</span><strong>{result.passengerDelayDeltaMinutes.toFixed(1)} passenger-minutes ({result.passengerDelayDeltaPerPassenger.toFixed(2)} minutes per rider)</strong>
          {!!result.terminalHoldDeltaPassengerMinutes && <><span>Committed hold beyond finish delta</span><strong>{result.terminalHoldDeltaPassengerMinutes.toFixed(1)} passenger-minutes (included in system cost, separate from observed delay)</strong></>}
          <span>Satisfaction delta</span><strong>{result.satisfactionDelta.toFixed(1)} percentage points</strong>
          <span>System-cost delta (lower cost is better)</span><strong>{result.networkCostDelta.toFixed(0)}</strong>
          <span>Projection horizon</span><strong>{result.horizonMinutes} min{result.truncated ? " (scenario end)" : ""}</strong>
        </div>
        <p>More passenger delay is worse; more satisfaction is better.{result.truncated ? ` Requested ${result.requestedHorizonMinutes} min; projection stops at scenario end.` : ""}</p>
        <div className="preview" aria-label="Other affected roads">
          <strong>Other affected roads</strong>
          {others.length ? others.map(change => <div key={change.edgeId}>{roadName(change.edgeId)} {horizon(change)}: {utilization(change)}</div>) : <p>No other road changes above 1 percentage point.</p>}
        </div>
        <details><summary>All road horizons</summary>
          {result.forecastChanges.map(change => <div key={`${change.edgeId}-${change.actualHorizonMinutes}`}>{roadName(change.edgeId)} {horizon(change)}: {utilization(change)}</div>)}
        </details>
      </>}
      <div className="previewActions">
        {preview.status === "ready" && result && <button onClick={confirmPreview}>Apply</button>}
        {(preview.status === "error" || preview.status === "stale") && action && <button onClick={() => requestPreview(action)}>Retry</button>}
        <button onClick={cancelPreview}>Cancel</button>
      </div>
    </div>
  );
}
