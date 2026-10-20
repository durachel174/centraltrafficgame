import { Route, TimerReset } from "lucide-react";
import { PreviewReview } from "./PreviewReview";
import { useGameStore } from "../game/GameStore";
import type { SimulationAction } from "../simulation/types";

export function RoadInspector() {
  const { engine, selectedEdgeId, preview, requestPreview, previewCanceled, speed, setSpeed, lastActionNotice, clearActionNotice, tutorial, replay } = useGameStore();
  const state = engine.getState();
  const edge = selectedEdgeId ? state.graph.edge(selectedEdgeId) : state.graph.edge("north_bridge");
  const forecast = state.forecasts.find((item) => item.edgeId === edge.id);
  const speedKph = edge.lengthKm / Math.max(0.01, edge.currentTravelTime / 60);
  const rerouteAction: SimulationAction = { type: "REROUTE", targetEdge: edge.id, percentage: 0.25, avoidEdge: edge.id };
  const holdAction: SimulationAction = { type: "DELAY_DEPARTURES", targetEdge: edge.id, durationMinutes: 5, percentage: 0.25 };
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
      {replay && <p>Replay is read-only. Recorded interventions execute at their original ticks.</p>}
      <div className={`actionGrid ${preview.status !== "idle" ? "hasPreview" : ""}`} aria-label="Action choices">
        <div className="actionChoice">
          <button
            className={highlightPreview ? "tutorialTarget" : ""}
            disabled={preview.status === "loading" || !!replay}
            onClick={() => requestPreview(rerouteAction)}
            aria-describedby="reroute-help"
          >
            <Route size={16} /> Preview Reroute
          </button>
          <div className="actionHint" id="reroute-help" role="tooltip">
            <strong>Reroute 25%</strong>
            <span>Moves eligible approaching vehicles around this road. Best for a bridge or approach forecast to overload soon.</span>
            <em>Click Preview to pause and calculate the tradeoff.</em>
          </div>
        </div>
        {showHold && (
          <div className="actionChoice">
            <button
              disabled={preview.status === "loading" || !!replay}
              onClick={() => requestPreview(holdAction)}
              aria-describedby="hold-help"
            >
              <TimerReset size={16} /> Preview Hold
            </button>
            <div className="actionHint" id="hold-help" role="tooltip">
              <strong>Hold trips 5m</strong>
              <span>Keeps eligible waiting trips off the network briefly. Useful when adding more cars would make a jam worse.</span>
              <em>Click Preview to pause and calculate the tradeoff.</em>
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
      <PreviewReview />
      {previewCanceled && preview.status === "idle" && speed === 0 && (
        <div className="actionNotice" role="status">
          <span>Preview canceled. No action applied. Simulation remains paused.</span>
          <button onClick={() => setSpeed(1)}>Resume 1x</button>
        </div>
      )}
    </section>
  );
}
