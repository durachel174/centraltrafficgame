import { useLayoutEffect, useRef } from "react";
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
  const { engine, scenario, preview, tutorial, requestPreview, confirmPreview, cancelPreview } = useGameStore();
  const review = useRef<HTMLDivElement>(null), previousActive = useRef(false), origin = useRef<string | null>(null);
  const active = preview.status !== "idle";
  useLayoutEffect(() => {
    if (active && !previousActive.current) {
      origin.current = preview.action?.type === "ROUTE_GROUP" ? `preview-group-${preview.action.corridorId}` : preview.action?.type === "DELAY_DEPARTURES" || preview.action?.type === "HOLD_GROUP" ? "preview-hold" : "preview-reroute";
      review.current?.focus();
    } else if (active && document.activeElement === document.body) {
      review.current?.focus();
    } else if (!active && previousActive.current && document.activeElement === document.body) {
      (document.getElementById(origin.current ?? "road-selector") ?? document.getElementById("bay-resume"))?.focus();
    }
    previousActive.current = active;
  }, [active, preview.action, preview.status]);
  if (!active) return null;
  const result = preview.result;
  const action = preview.action;
  const graph = engine.getState().graph;
  const roadName = (id: string) => graph.edges.get(id)?.name ?? id.replaceAll("_", " ");
  const actionLabel = action?.type === "REROUTE" ? `Reroute ${action.percentage * 100}%`
    : action?.type === "DELAY_DEPARTURES" ? `Hold ${(action.percentage ?? 1) * 100}% of eligible waiting trips for ${action.durationMinutes} min`
    : action?.type === "ROUTE_GROUP" ? `Send ${scenario.demand.batches?.find(b => b.id === action.groupId)?.label ?? action.groupId} via ${action.corridorId}`
    : action?.type === "HOLD_GROUP" ? `Hold ${scenario.demand.batches?.find(b => b.id === action.groupId)?.label ?? action.groupId} for ${action.durationMinutes} min`
    : action?.type.replaceAll("_", " ") ?? "Action";
  const selected = result?.forecastChanges.find(change => change.edgeId === preview.targetEdgeId && Math.abs(change.actualHorizonMinutes - result.horizonMinutes) < 0.000001)
    ?? result?.forecastChanges.find(change => change.edgeId === preview.targetEdgeId && change.requestedHorizonMinutes === result.requestedHorizonMinutes);
  const others = rankRoadChanges(result?.forecastChanges ?? [], preview.targetEdgeId).slice(0, 3);
  const utilization = (change: ForecastDelta) => `${(change.before * 100).toFixed(0)}% -> ${(change.after * 100).toFixed(0)}%`;
  const finishLabel = scenario.evaluation ? "evaluation end" : "scenario end";
  const horizon = (change: ForecastDelta) => `+${change.actualHorizonMinutes} min${change.truncated ? ` (${finishLabel})` : ""}`;
  return (
    <div ref={review} tabIndex={-1} role="region" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); cancelPreview(); } }} className={`previewDialog ${tutorial.active && tutorial.step === "review" ? "tutorialTarget" : ""}`} aria-label="Action review">
      <p className="srOnly" role="status">{preview.status === "ready" ? `Preview ready. ${result?.affectedVehicles ?? 0} affected trips. Review projected effects, then Apply or Cancel.` : preview.status === "loading" ? "Calculating preview." : preview.status === "stale" ? "Preview is stale. Retry before applying." : `Preview failed: ${preview.error ?? "Unknown error"}. Retry or Cancel.`}</p>
      <strong>{actionLabel} on {preview.targetEdgeId ? roadName(preview.targetEdgeId) : "network"}</strong>
      <p>Projected effects versus no action, assuming no further intervention. These are projections, not observed outcomes.</p>
      {preview.status === "loading" && <p>Calculating preview...</p>}
      {preview.status === "error" && <p>{preview.error ?? "Preview failed."}</p>}
      {preview.status === "stale" && <p>Simulation changed. Recompute before applying.</p>}
      {preview.status === "ready" && result && <>
        {scenario.departureGroups ? <>
        <div className="statGrid">
          <span>Commuters affected</span><strong>{result.affectedVehicles}</strong>
          <span>Projected average delay change</span><strong>{result.passengerDelayDeltaPerPassenger.toFixed(2)} minutes per rider</strong>
          <span>Selected bridge pressure</span><strong>{selected ? `${roadName(selected.edgeId)}: ${utilization(selected)}` : preview.targetEdgeId ? "Unavailable" : "No bridge selected (hold)"}</strong>
          <span>Most affected alternative road</span><strong>{others[0] ? `${roadName(others[0].edgeId)} ${horizon(others[0])}: ${utilization(others[0])}` : "No change above 1 percentage point"}</strong>
          <span>Actual projection horizon</span><strong>{result.horizonMinutes} min{result.truncated ? ` (${finishLabel})` : ""}</strong>
        </div>
        <p>Negative delay means less delay; positive means more. Average is across all projected riders, not only this group. This short projection is not a guaranteed arrival time or final journey saving.</p>
        {result.includesClearance && <p>Includes clearance after demand ends.</p>}
        <details><summary>Detailed metrics and road horizons</summary>
          <p>System-cost delta (lower cost is better): {result.networkCostDelta.toFixed(0)}</p>
          <p>Satisfaction delta: {result.satisfactionDelta.toFixed(1)} percentage points (higher is better).</p>
          <p>Total passenger-delay delta: {result.passengerDelayDeltaMinutes.toFixed(1)} passenger-minutes.</p>
          {!!result.terminalHoldDeltaPassengerMinutes && <p>Committed hold beyond finish: {result.terminalHoldDeltaPassengerMinutes.toFixed(1)} passenger-minutes.</p>}
          <p>Requested {result.requestedHorizonMinutes} min; no-action branch {result.baselineHorizonMinutes ?? result.horizonMinutes} min; action branch {result.actionHorizonMinutes ?? result.horizonMinutes} min. Earlier-finished branches retain their final state.</p>
          {result.forecastChanges.map(change => <div key={`${change.edgeId}-${change.requestedHorizonMinutes}`}>{roadName(change.edgeId)} {horizon(change)}: {utilization(change)}</div>)}
        </details>
        </> : <>
        <div className="statGrid">
          <span>Actual affected trips</span><strong>{result.affectedVehicles}</strong>
          <span>This road utilization</span><strong>{selected ? utilization(selected) : "Unavailable"}</strong>
          <span>Passenger-delay delta</span><strong>{result.passengerDelayDeltaMinutes.toFixed(1)} passenger-minutes ({result.passengerDelayDeltaPerPassenger.toFixed(2)} minutes per rider)</strong>
          {!!result.terminalHoldDeltaPassengerMinutes && <><span>Committed hold beyond finish delta</span><strong>{result.terminalHoldDeltaPassengerMinutes.toFixed(1)} passenger-minutes (included in system cost, separate from observed delay)</strong></>}
          <span>Satisfaction delta</span><strong>{result.satisfactionDelta.toFixed(1)} percentage points</strong>
          <span>System-cost delta (lower cost is better)</span><strong>{result.networkCostDelta.toFixed(0)}</strong>
          <span>Projection horizon</span><strong>{result.horizonMinutes} min{result.truncated ? ` (${finishLabel})` : ""}</strong>
        </div>
        <p>{result.includesClearance ? "This horizon includes clearance: demand ends at the decision cutoff, and existing trips continue. " : ""}This is a short-horizon projection, not a complete final-cost prediction.
          {result.baselineHorizonMinutes !== undefined && result.actionHorizonMinutes !== undefined && result.baselineHorizonMinutes !== result.actionHorizonMinutes ? ` No-action branch: ${result.baselineHorizonMinutes} min; action branch: ${result.actionHorizonMinutes} min (earlier finish is held at its final state).` : ""}</p>
        <p>More passenger delay is worse; more satisfaction is better.{result.truncated ? ` Requested ${result.requestedHorizonMinutes} min; projection stops at ${finishLabel}.` : ""}</p>
        <div className="preview" aria-label="Other affected roads">
          <strong>Other affected roads</strong>
          {others.length ? others.map(change => <div key={change.edgeId}>{roadName(change.edgeId)} {horizon(change)}: {utilization(change)}</div>) : <p>No other road changes above 1 percentage point.</p>}
        </div>
        <details><summary>All road horizons</summary>
          {result.forecastChanges.map(change => <div key={`${change.edgeId}-${change.actualHorizonMinutes}`}>{roadName(change.edgeId)} {horizon(change)}: {utilization(change)}</div>)}
        </details>
        </>}
      </>}
      <div className="previewActions">
        {preview.status === "ready" && result && <button onClick={confirmPreview}>Apply</button>}
        {(preview.status === "error" || preview.status === "stale") && action && <button onClick={() => requestPreview(action)}>Retry</button>}
        <button onClick={cancelPreview}>Cancel</button>
      </div>
    </div>
  );
}
