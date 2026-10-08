import { useEffect, useRef } from "react";
import { useGameStore } from "../game/GameStore";
import { renderTrafficMap } from "../rendering/TrafficRenderer";

export function TrafficMap() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { engine, version, selectedEdgeId, selectEdge } = useGameStore();

  useEffect(() => {
    if (canvasRef.current) renderTrafficMap(canvasRef.current, engine, selectedEdgeId);
  }, [engine, selectedEdgeId, version]);

  return (
    <canvas
      ref={canvasRef}
      className="trafficCanvas"
      onClick={(event) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 1000;
        const y = ((event.clientY - rect.top) / rect.height) * 660;
        let best = { id: null as string | null, distance: 18 };
        for (const edge of engine.getState().graph.edges.values()) {
          if (edge.id.endsWith("_rev")) continue;
          const from = engine.getState().graph.node(edge.from);
          const to = engine.getState().graph.node(edge.to);
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / (dx * dx + dy * dy)));
          const px = from.x + dx * t;
          const py = from.y + dy * t;
          const distance = Math.hypot(x - px, y - py);
          if (distance < best.distance) best = { id: edge.id, distance };
        }
        selectEdge(best.id);
      }}
    />
  );
}
