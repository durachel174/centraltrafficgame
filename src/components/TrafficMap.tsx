import { recordBrowserTiming } from "../performance/Recorder";
import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../game/GameStore";
import { renderTrafficMap } from "../rendering/TrafficRenderer";

export function TrafficMap() {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!preference) return;
    const changed = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", changed);
    return () => preference.removeEventListener("change", changed);
  }, []);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { engine, version, selectedEdgeId, selectEdge, preview } = useGameStore();

  useEffect(() => {
    const started = recordBrowserTiming ? performance.now() : 0;
    if (canvasRef.current) renderTrafficMap(canvasRef.current, engine, selectedEdgeId, preview.result, reducedMotion);
    recordBrowserTiming?.("canvasDraw", performance.now() - started);
  }, [engine, selectedEdgeId, version, preview.result, reducedMotion]);

  return (
    <>
    <canvas
      ref={canvasRef}
      className="trafficCanvas"
      role="img" aria-label="Traffic map. Use Inspect road to select roads with the keyboard; current traffic and forecasts appear in the inspector."
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
    {reducedMotion && <p className="reducedMotionNote">Reduced motion: moving vehicle markers hidden. Traffic still runs.</p>}
    </>
  );
}
