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
  const holdAction: SimulationAction = { type: "DELAY_DEPARTURES", destination: edge.to, durationMinutes: 5, percentage: 0.25 };
  const selectedPreview = preview.result;
  const selectedRoadChange = selectedPreview?.forecastChanges.find(
    (change) => change.edgeId === edge.id && change.horizonMinutes === selectedPreview.horizonMinutes
  );
  const otherChanges = selectedPreview?.forecastChanges
    .filter((change) => change.edgeId !== edge.id && Math.abs(change.after - change.before) > 0.01)
    .slice(0, 3);

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
          <span>+5m {(forecast.utilization5m * 100).toFixed(0)}%</span>
          <span>+10m {(forecast.utilization10m * 100).toFixed(0)}%</span>
          <span>+15m {(forecast.utilization15m * 100).toFixed(0)}%</span>
        </div>
      )}
      <button onClick={() => requestPreview(rerouteAction)}>
        <Route size={16} /> Preview Reroute 25%
      </button>
      <button onClick={() => requestPreview(holdAction)}>
        <TimerReset size={16} /> Preview Hold Downstream 5m
      </button>
      {preview.status !== "idle" && (
        <div className="previewDialog">
          <strong>Projection assumes no further intervention.</strong>
          {preview.status === "loading" && <p>Calculating preview...</p>}
          {preview.status === "stale" && <p>Simulation changed. Recompute before confirming.</p>}
          {preview.status === "ready" && selectedPreview && (
            <>
              <div className="statGrid">
                <span>Affected trips</span>
                <strong>{selectedPreview.affectedVehicles}</strong>
                <span>Selected road</span>
                <strong>
                  {selectedRoadChange
                    ? `${(selectedRoadChange.before * 100).toFixed(0)}% -> ${(selectedRoadChange.after * 100).toFixed(0)}%`
                    : "No change"}
                </strong>
                <span>Objective delta</span>
                <strong>{selectedPreview.networkCostDelta.toFixed(0)}</strong>
                <span>Passenger delay</span>
                <strong>{selectedPreview.passengerDelayDeltaPerPassenger.toFixed(2)} min/rider</strong>
                <span>Satisfaction</span>
                <strong>{selectedPreview.satisfactionDelta.toFixed(1)}</strong>
                <span>Horizon</span>
                <strong>{selectedPreview.horizonMinutes} min</strong>
              </div>
              {!!otherChanges?.length && (
                <div className="preview">
                  {otherChanges.map((change) => (
                    <div key={`${change.edgeId}-${change.horizonMinutes}`}>
                      {change.edgeId.replaceAll("_", " ")} +{change.horizonMinutes}m: {(change.before * 100).toFixed(0)}% to{" "}
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
              <button onClick={cancelPreview}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
