import type { SimulationEngine } from "../simulation/core/SimulationEngine";

const trafficColor = (u: number) => {
  if (u > 1.15) return "#ff4d5f";
  if (u > 0.9) return "#ffb84a";
  if (u > 0.62) return "#f5df62";
  return "#53d69b";
};

export function renderTrafficMap(canvas: HTMLCanvasElement, engine: SimulationEngine, selectedEdgeId: string | null) {
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
  ctx.fillStyle = "#071119";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0b2634";
  ctx.beginPath();
  ctx.ellipse(width * 0.49, height * 0.52, width * 0.18, height * 0.45, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#11283a";
  ctx.fillRect(0, height * 0.45, width, height * 0.1);

  ctx.lineCap = "round";
  for (const edge of state.graph.edges.values()) {
    if (edge.id.endsWith("_rev")) continue;
    const from = state.graph.node(edge.from);
    const to = state.graph.node(edge.to);
    const u = edge.currentVehicleCount / Math.max(1, edge.comfortableCapacity * edge.capacityModifier);
    ctx.strokeStyle = trafficColor(u);
    ctx.globalAlpha = edge.id === selectedEdgeId ? 1 : 0.75;
    ctx.lineWidth = (edge.major ? 5 : 3) + Math.min(8, u * 3) + (edge.id === selectedEdgeId ? 4 : 0);
    ctx.beginPath();
    ctx.moveTo(from.x * sx, from.y * sy);
    ctx.lineTo(to.x * sx, to.y * sy);
    ctx.stroke();
    if (u > 1) {
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.setLineDash([4, 8]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
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
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  ctx.globalAlpha = 1;
}
