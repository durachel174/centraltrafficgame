import { Route, TimerReset } from "lucide-react";
import { useGameStore } from "../game/GameStore";

export function RoadInspector() {
  const { engine, selectedEdgeId, step } = useGameStore();
  const state = engine.getState();
  const edge = selectedEdgeId ? state.graph.edge(selectedEdgeId) : state.graph.edge("north_bridge");
  const forecast = state.forecasts.find((item) => item.edgeId === edge.id);
  const reroutePreview = engine.previewAction({ type: "REROUTE", targetEdge: edge.id, percentage: 0.25, avoidEdge: edge.id });
  const delayPreview = engine.previewAction({ type: "DELAY_DEPARTURES", destination: "downtown", durationMinutes: 5, percentage: 0.25 });
  const speedKph = edge.lengthKm / Math.max(0.01, edge.currentTravelTime / 60);

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
      <div className="preview">
        Reroute 25%: {reroutePreview.affectedVehicles} vehicles, passenger delay +{reroutePreview.averagePassengerDelayDelta.toFixed(1)}m
      </div>
      <button onClick={() => step({ type: "REROUTE", targetEdge: edge.id, percentage: 0.25, avoidEdge: edge.id })}>
        <Route size={16} /> Reroute 25%
      </button>
      <div className="preview">
        Hold downtown departures: {delayPreview.affectedVehicles} trips, satisfaction {delayPreview.satisfactionDelta.toFixed(1)}
      </div>
      <button onClick={() => step({ type: "DELAY_DEPARTURES", destination: "downtown", durationMinutes: 5, percentage: 0.25 })}>
        <TimerReset size={16} /> Hold 5 min
      </button>
    </section>
  );
}
