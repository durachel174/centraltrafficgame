import { AlertTriangle } from "lucide-react";
import { useGameStore } from "../game/GameStore";

export function AlertPanel() {
  const { engine, selectEdge } = useGameStore();
  const alerts = engine.getState().alerts.slice(0, 4);
  return (
    <section className="panel">
      <h2>What Needs Attention</h2>
      {alerts.length === 0 && <p className="muted">No heavy congestion forecast yet.</p>}
      {alerts.map((alert) => (
        <button key={alert.id} className={`alert ${alert.severity.toLowerCase()}`} onClick={() => selectEdge(alert.edgeId)}>
          <AlertTriangle size={16} />
          <span>
            {alert.edgeId.replaceAll("_", " ")}
            <small>
              Heavy congestion expected in {alert.minutesUntil} min{alert.truncated ? " (scenario end)" : ""},{" "}
              {(alert.predicted * 100).toFixed(0)}%
            </small>
          </span>
        </button>
      ))}
    </section>
  );
}
