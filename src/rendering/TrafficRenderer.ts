import type { SimulationEngine } from "../simulation/core/SimulationEngine";
import type { ActionPreview } from "../simulation/types";

const trafficColor = (u: number) => {
  if (u > 1.15) return "#ff4d5f";
  if (u > 0.9) return "#ffb84a";
  if (u > 0.62) return "#f5df62";
  return "#53d69b";
};

export function renderTrafficMap(canvas: HTMLCanvasElement, engine: SimulationEngine, selectedEdgeId: string | null, preview?: ActionPreview | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx.scale(ratio, ratio);
  const width = rect.width;
  const height = rect.height;
  const sx = width / 1000;
  const sy = height / 660;
  const state = engine.getState();

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#08121a";
  ctx.fillRect(0, 0, width, height);
  const landGradient = ctx.createLinearGradient(0, 0, width, height);
  landGradient.addColorStop(0, "#10212a");
  landGradient.addColorStop(1, "#0b171f");
  ctx.fillStyle = landGradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#102a38";
  ctx.beginPath();
  ctx.ellipse(width * 0.49, height * 0.52, width * 0.18, height * 0.45, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(20, 64, 82, 0.7)";
  ctx.fillRect(0, height * 0.45, width, height * 0.1);
  ctx.fillStyle = "rgba(190, 221, 205, 0.08)";
  ctx.fillRect(0, 0, width * 0.44, height);
  ctx.fillStyle = "rgba(220, 210, 168, 0.07)";
  ctx.fillRect(width * 0.58, 0, width * 0.42, height);
  ctx.fillStyle = "rgba(200,230,240,.18)";
  ctx.font = "12px system-ui";
  ctx.fillText("North residential", 26, 42);
  ctx.fillText("Downtown", width * 0.64, height * 0.37);
  ctx.fillText("Airport / Harbor", width * 0.62, height * 0.84);

  const previewEdges = new Set(preview?.forecastChanges.filter((change) => Math.abs(change.after - change.before) > 0.01).map((change) => change.edgeId));

  ctx.lineCap = "round";
  for (const edge of state.graph.edges.values()) {
    if (edge.id.endsWith("_rev")) continue;
    const from = state.graph.node(edge.from);
    const to = state.graph.node(edge.to);
    const u = edge.currentVehicleCount / Math.max(1, edge.comfortableCapacity * edge.capacityModifier);
    const selected = edge.id === selectedEdgeId;
    const inPreview = previewEdges.has(edge.id);
    ctx.strokeStyle = selected ? "#f8f2a5" : trafficColor(u);
    ctx.globalAlpha = selected || inPreview ? 1 : 0.76;
    ctx.lineWidth = (edge.major ? 5 : 3) + Math.min(8, u * 3) + (selected ? 5 : inPreview ? 3 : 0);
    ctx.beginPath();
    ctx.moveTo(from.x * sx, from.y * sy);
    ctx.lineTo(to.x * sx, to.y * sy);
    ctx.stroke();
    if (u > 0.9) {
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.setLineDash(u > 1.15 ? [2, 5] : [8, 8]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (edge.major) {
      ctx.fillStyle = "rgba(235,245,250,.7)";
      ctx.font = "11px system-ui";
      ctx.fillText(edge.name ?? edge.id, (from.x * sx + to.x * sx) / 2 + 6, (from.y * sy + to.y * sy) / 2 - 6);
    }
  }
  ctx.globalAlpha = 1;

  for (const node of state.graph.nodes.values()) {
    ctx.fillStyle = node.type === "origin" ? "#92a7ff" : node.type === "destination" ? "#ddf2a2" : "#6d8294";
    ctx.beginPath();
    ctx.arc(node.x * sx, node.y * sy, node.type === "intersection" ? 3 : 5, 0, Math.PI * 2);
    ctx.fill();
    if (node.district && node.type !== "intersection") {
      ctx.fillStyle = "rgba(221,232,242,.75)";
      ctx.font = "11px system-ui";
      ctx.fillText(node.district, node.x * sx + 8, node.y * sy - 8);
    }
  }

  ctx.fillStyle = "#e9f7ff";
  for (const vehicle of state.vehicles) {
    if (vehicle.status !== "traveling") continue;
    const edge = state.graph.edge(vehicle.route[vehicle.currentEdgeIndex]);
    const from = state.graph.node(edge.from);
    const to = state.graph.node(edge.to);
    const x = (from.x + (to.x - from.x) * vehicle.edgeProgress) * sx;
    const y = (from.y + (to.y - from.y) * vehicle.edgeProgress) * sy;
    ctx.globalAlpha = vehicle.rerouteCount > 0 ? 0.85 : 0.42;
    ctx.fillStyle = vehicle.rerouteCount > 0 ? "#f8f2a5" : "#e9f7ff";
    ctx.beginPath();
    ctx.arc(x, y, vehicle.rerouteCount > 0 ? 2.2 : 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
