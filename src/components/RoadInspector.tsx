import { Route, TimerReset } from "lucide-react";
import { useGameStore } from "../game/GameStore";
import type { SimulationAction } from "../simulation/types";

export function RoadInspector() {
  const { engine, selectedEdgeId, preview, requestPreview, cancelPreview, confirmPreview, lastActionNotice, clearActionNotice, tutorial } = useGameStore();
  const state = engine.getState();
  const edge = selectedEdgeId ? state.graph.edge(selectedEdgeId) : state.graph.edge("north_bridge");
  const forecast = state.forecasts.find((item) => item.edgeId === edge.id);
  const speedKph = edge.lengthKm / Math.max(0.01, edge.currentTravelTime / 60);
  const rerouteAction: SimulationAction = { type: "REROUTE", targetEdge: edge.id, percentage: 0.25, avoidEdge: edge.id };
  const holdAction: SimulationAction = { type: "DELAY_DEPARTURES", targetEdge: edge.id, durationMinutes: 5, percentage: 0.25 };
  const selectedPreview = preview.result;
  const reviewedEdgeId = preview.targetEdgeId ?? edge.id;
  const reviewedEdge = state.graph.edges.get(reviewedEdgeId);
  const selectedRoadChanges = selectedPreview?.forecastChanges.filter((change) => change.edgeId === reviewedEdgeId) ?? [];
  const selectedRoadChange =
    selectedRoadChanges.find((change) => Math.abs(change.actualHorizonMinutes - (selectedPreview?.horizonMinutes ?? 0)) < 0.000001) ??
    selectedRoadChanges.find((change) => change.requestedHorizonMinutes === selectedPreview?.requestedHorizonMinutes);
  const otherChanges = selectedPreview?.forecastChanges
    .filter((change) => change.edgeId !== reviewedEdgeId && Math.abs(change.after - change.before) > 0.01)
    .slice(0, 3);
  const previewActionLabel =
    preview.action?.type === "REROUTE"
      ? "Reroute 25%"
      : preview.action?.type === "DELAY_DEPARTURES"
        ? "Hold eligible waiting trips 5m"
        : preview.action?.type.replaceAll("_", " ") ?? "Preview";
  const retryAction = preview.action ? { ...preview.action } : null;
  const forecastSamples = forecast?.samples.length
    ? forecast.samples
    : forecast
      ? [
          { requestedHorizonMinutes: 5, actualHorizonMinutes: 5, truncated: false, utilization: forecast.utilization5m },
          { requestedHorizonMinutes: 10, actualHorizonMinutes: 10, truncated: false, utilization: forecast.utilization10m },
          { requestedHorizonMinutes: 15, actualHorizonMinutes: 15, truncated: false, utilization: forecast.utilization15m }
        ]
      : [];
  const horizonLabel = (actual: number, truncated: boolean) => `+${actual}m${truncated ? " scenario end" : ""}`;
  const showHold = !tutorial.active || tutorial.step === "hold" || tutorial.step === "complete";
  const highlightForecast = tutorial.active && tutorial.step === "forecast";
  const highlightPreview = tutorial.active && tutorial.step === "preview";
  const highlightReview = tutorial.active && tutorial.step === "review";
  const targetEdgeForAction = (action: SimulationAction) => ("targetEdge" in action ? (action.targetEdge ?? null) : null);
  const actionsMatch = (left: SimulationAction | null, right: SimulationAction) => {
    if (!left || left.type !== right.type) return false;
    if (left.type === "REROUTE" && right.type === "REROUTE") {
      return left.targetEdge === right.targetEdge && left.avoidEdge === right.avoidEdge && left.percentage === right.percentage;
    }
    if (left.type === "DELAY_DEPARTURES" && right.type === "DELAY_DEPARTURES") {
      return left.targetEdge === right.targetEdge && left.origin === right.origin && left.destination === right.destination && left.durationMinutes === right.durationMinutes && left.percentage === right.percentage;
    }
    return false;
  };
  const actionPreviewState = (action: SimulationAction) => {
    const matches = actionsMatch(preview.action, action) && preview.targetEdgeId === targetEdgeForAction(action);
    return {
      matches,
      loading: matches && preview.status === "loading",
      ready: matches && preview.status === "ready" && !!preview.result,
      error: matches && preview.status === "error",
      result: matches ? preview.result : null
    };
  };
  const handleActionFocus = (action: SimulationAction) => {
    const stateForAction = actionPreviewState(action);
    if (!stateForAction.matches || preview.status === "idle" || preview.status === "stale" || preview.status === "error") requestPreview(action);
  };
  const handleActionClick = (action: SimulationAction) => {
    const stateForAction = actionPreviewState(action);
    if (stateForAction.ready) {
      confirmPreview();
      return;
    }
    requestPreview(action);
  };
  const actionStats = (action: SimulationAction) => {
    const stateForAction = actionPreviewState(action);
    const result = stateForAction.result;
    const changes = result?.forecastChanges.filter((change) => change.edgeId === edge.id) ?? [];
    const selectedChange =
      changes.find((change) => Math.abs(change.actualHorizonMinutes - (result?.horizonMinutes ?? 0)) < 0.000001) ??
      changes.find((change) => change.requestedHorizonMinutes === result?.requestedHorizonMinutes);
    if (stateForAction.loading) return <span>Calculating measured effect...</span>;
    if (stateForAction.error) return <span>Preview failed. Focus again to retry.</span>;
    if (!result) return <span>Focus this action to preview measured effect before applying it.</span>;
    return (
      <dl className="actionStats">
        <div>
          <dt>Affected</dt>
          <dd>{result.affectedVehicles}</dd>
        </div>
        <div>
          <dt>This road</dt>
          <dd>{selectedChange ? `${(selectedChange.before * 100).toFixed(0)}% -> ${(selectedChange.after * 100).toFixed(0)}%` : "Unavailable"}</dd>
        </div>
        <div>
          <dt>Delay</dt>
          <dd>{result.passengerDelayDeltaMinutes.toFixed(1)} min</dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>{result.networkCostDelta.toFixed(0)}</dd>
        </div>
        <div>
          <dt>Horizon</dt>
          <dd>
            {result.horizonMinutes}m{result.truncated ? " end" : ""}
          </dd>
        </div>
      </dl>
    );
  };
  const normalPlayerPreview = preview.action?.type === "REROUTE" || preview.action?.type === "DELAY_DEPARTURES";

  return (
    <section className="panel">
      <h2>{edge.name ?? edge.id}</h2>
      <p className="plainLead">{edge.currentVehicleCount > 0 ? `${edge.name ?? edge.id} is carrying ${edge.currentVehicleCount} vehicles.` : "Select a road to inspect traffic and preview an intervention."}</p>
      <div className="statGrid">
        <span>Vehicles</span>
        <strong>{edge.currentVehicleCount}</strong>
        <span>Utilization</span>
        <strong>{(edge.currentVehicleCount / Math.max(1, edge.comfortableCapacity * edge.capacityModifier) * 100).toFixed(0)}%</strong>
        <span>Normal Travel</span>
        <strong>{edge.baseTravelTime.toFixed(1)} min</strong>
        <span>Current</span>
        <strong>{edge.currentTravelTime.toFixed(1)} min</strong>
        <span>Avg Speed</span>
        <strong>{speedKph.toFixed(0)} kph</strong>
      </div>
      {forecast && (
        <div className={`forecastRow ${highlightForecast ? "tutorialTarget" : ""}`}>
          {forecastSamples.map((sample) => (
            <span key={`${sample.requestedHorizonMinutes}-${sample.actualHorizonMinutes}`}>
              {horizonLabel(sample.actualHorizonMinutes, sample.truncated)} {(sample.utilization * 100).toFixed(0)}%
            </span>
          ))}
        </div>
      )}
      <div className="actionGrid" aria-label="Action choices">
        <div className="actionChoice">
          <button
            className={highlightPreview ? "tutorialTarget" : ""}
            onFocus={() => handleActionFocus(rerouteAction)}
            onMouseEnter={() => handleActionFocus(rerouteAction)}
            onClick={() => handleActionClick(rerouteAction)}
            aria-describedby="reroute-help"
          >
            <Route size={16} /> Reroute
          </button>
          <div className="actionHint" id="reroute-help" role="tooltip">
            <strong>Reroute 25%</strong>
            <span>Moves eligible approaching vehicles around this road. Best for a bridge or approach forecast to overload soon.</span>
            {actionStats(rerouteAction)}
            <em>{actionPreviewState(rerouteAction).ready ? "Click to apply this reroute now." : "Wait for stats before applying."}</em>
          </div>
        </div>
        {showHold && (
          <div className="actionChoice">
            <button
              onFocus={() => handleActionFocus(holdAction)}
              onMouseEnter={() => handleActionFocus(holdAction)}
              onClick={() => handleActionClick(holdAction)}
              aria-describedby="hold-help"
            >
              <TimerReset size={16} /> Hold
            </button>
            <div className="actionHint" id="hold-help" role="tooltip">
              <strong>Hold trips 5m</strong>
              <span>Keeps eligible waiting trips off the network briefly. Useful when adding more cars would make a jam worse.</span>
              {actionStats(holdAction)}
              <em>{actionPreviewState(holdAction).ready ? "Click to apply this hold now." : "Wait for stats before applying."}</em>
            </div>
          </div>
        )}
      </div>
      {lastActionNotice && (
        <div className="actionNotice" role="status">
          <strong>{lastActionNotice.text}</strong>
          <span>{lastActionNotice.affected} trips or vehicles affected. Watch the map for observed changes.</span>
          <button onClick={clearActionNotice}>Dismiss</button>
        </div>
      )}
      {preview.status !== "idle" && (highlightReview || !normalPlayerPreview) && (
        <div className={`previewDialog ${highlightReview ? "tutorialTarget" : ""}`}>
          <strong>
            {previewActionLabel} on {reviewedEdge?.name ?? reviewedEdgeId}
          </strong>
          <p>This compares doing nothing with the action you are reviewing. More delay is worse; more satisfaction is better.</p>
          {preview.status === "loading" && <p>Calculating preview...</p>}
          {preview.status === "stale" && <p>Simulation changed. Recompute before confirming.</p>}
          {preview.status === "error" && <p>{preview.error ?? "Preview failed."}</p>}
          {preview.status === "ready" && selectedPreview && (
            <>
              <div className="statGrid">
                <span>Affected trips</span>
                <strong>{selectedPreview.affectedVehicles}</strong>
                <span>Selected road</span>
                <strong>
                  {selectedRoadChange
                    ? `${(selectedRoadChange.before * 100).toFixed(0)}% -> ${(selectedRoadChange.after * 100).toFixed(0)}%`
                    : "Unavailable"}
                </strong>
                <span>System cost</span>
                <strong>{selectedPreview.networkCostDelta.toFixed(0)}</strong>
                <span>Passenger delay</span>
                <strong>
                  {selectedPreview.passengerDelayDeltaMinutes.toFixed(1)} passenger-min ({selectedPreview.passengerDelayDeltaPerPassenger.toFixed(2)} min/rider)
                </strong>
                <span>Satisfaction</span>
                <strong>{selectedPreview.satisfactionDelta.toFixed(1)}</strong>
                <span>Horizon</span>
                <strong>
                  {selectedPreview.horizonMinutes} min{selectedPreview.truncated ? " (scenario end)" : ""}
                </strong>
                {preview.timings && (
                  <>
                    <span>Preview time</span>
                    <strong>{preview.timings.roundTripMs.toFixed(0)} ms ({preview.timings.calculationMs.toFixed(0)} ms calc)</strong>
                  </>
                )}
              </div>
              {!!otherChanges?.length && (
                <div className="preview">
                  <strong>Other affected roads</strong>
                  {otherChanges.map((change) => (
                    <div key={`${change.edgeId}-${change.horizonMinutes}`}>
                      {change.edgeId.replaceAll("_", " ")} {horizonLabel(change.actualHorizonMinutes, change.truncated)}: {(change.before * 100).toFixed(0)}% to{" "}
                      {(change.after * 100).toFixed(0)}%
                    </div>
                  ))}
                </div>
              )}
              <div className="previewActions">
                <button onClick={confirmPreview}>Confirm</button>
                <button onClick={cancelPreview}>Cancel</button>
              </div>
            </>
          )}
          {preview.status !== "ready" && (
            <div className="previewActions">
              {preview.status === "error" && retryAction && <button onClick={() => requestPreview(retryAction)}>Retry</button>}
              <button onClick={cancelPreview}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
