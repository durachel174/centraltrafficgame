import { Route, TimerReset } from "lucide-react";
import { useGameStore } from "../game/GameStore";
import type { SimulationAction } from "../simulation/types";

export function RoadInspector() {
  const { engine, selectedEdgeId, preview, requestPreview, cancelPreview, confirmPreview } = useGameStore();
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

  return (
    <section className="panel">
      <h2>{edge.name ?? edge.id}</h2>
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
        <div className="forecastRow">
          {forecastSamples.map((sample) => (
            <span key={`${sample.requestedHorizonMinutes}-${sample.actualHorizonMinutes}`}>
              {horizonLabel(sample.actualHorizonMinutes, sample.truncated)} {(sample.utilization * 100).toFixed(0)}%
            </span>
          ))}
        </div>
      )}
      <button onClick={() => requestPreview(rerouteAction)}>
        <Route size={16} /> Preview Reroute 25%
      </button>
      <button onClick={() => requestPreview(holdAction)}>
        <TimerReset size={16} /> Preview Hold Eligible Waiting Trips 5m
      </button>
      {preview.status !== "idle" && (
        <div className="previewDialog">
          <strong>
            {previewActionLabel} on {reviewedEdge?.name ?? reviewedEdgeId}
          </strong>
          <p>Projection assumes no further intervention. Positive cost and delay are worse; positive satisfaction is better.</p>
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
                <span>Objective delta</span>
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
