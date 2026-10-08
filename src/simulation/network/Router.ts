import { travelTime, type CongestionConfig } from "../traffic/CongestionModel";
import type { TrafficGraph } from "./TrafficGraph";

export interface RoutingContext {
  avoidEdges?: string[];
  penalizedEdges?: Record<string, number>;
  weight?: "currentTravelTime" | "baseTravelTime" | "distance";
}

export class Router {
  constructor(
    private graph: TrafficGraph,
    private congestion: CongestionConfig
  ) {}

  findRoute(origin: string, destination: string, context: RoutingContext = {}): string[] {
    const avoid = new Set(context.avoidEdges ?? []);
    const dist = new Map<string, number>();
    const prevNode = new Map<string, string>();
    const prevEdge = new Map<string, string>();
    const open = new Set<string>(this.graph.nodes.keys());
    for (const node of open) dist.set(node, node === origin ? 0 : Number.POSITIVE_INFINITY);

    while (open.size) {
      let current = "";
      let best = Number.POSITIVE_INFINITY;
      for (const node of open) {
        const value = dist.get(node) ?? Number.POSITIVE_INFINITY;
        if (value < best) {
          best = value;
          current = node;
        }
      }
      if (!current || current === destination) break;
      open.delete(current);
      for (const edge of this.graph.outgoingEdges(current)) {
        if (edge.closed || avoid.has(edge.id)) continue;
        const penalty = context.penalizedEdges?.[edge.id] ?? 0;
        const weight =
          context.weight === "baseTravelTime"
            ? edge.baseTravelTime
            : context.weight === "distance"
              ? edge.lengthKm
              : travelTime(edge, this.congestion);
        const candidate = best + weight + penalty;
        if (candidate < (dist.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
          dist.set(edge.to, candidate);
          prevNode.set(edge.to, current);
          prevEdge.set(edge.to, edge.id);
        }
      }
    }

    const route: string[] = [];
    let cursor = destination;
    while (cursor !== origin) {
      const edge = prevEdge.get(cursor);
      const parent = prevNode.get(cursor);
      if (!edge || !parent) return [];
      route.unshift(edge);
      cursor = parent;
    }
    return route;
  }
}
