import type { GraphConfig, RoadEdge, TrafficNode } from "./types";

export class TrafficGraph {
  readonly nodes = new Map<string, TrafficNode>();
  readonly edges = new Map<string, RoadEdge>();
  private outgoing = new Map<string, string[]>();

  constructor(config: GraphConfig) {
    for (const node of config.nodes) this.nodes.set(node.id, node);
    for (const edge of config.edges) {
      const baseTravelTime = (edge.lengthKm / edge.speedLimitKph) * 60;
      const hydrated: RoadEdge = {
        ...edge,
        currentVehicleCount: 0,
        baseTravelTime,
        currentTravelTime: baseTravelTime,
        capacityModifier: 1,
        closed: false
      };
      this.edges.set(edge.id, hydrated);
      this.outgoing.set(edge.from, [...(this.outgoing.get(edge.from) ?? []), edge.id]);
    }
  }

  clone(): TrafficGraph {
    const config: GraphConfig = {
      nodes: Array.from(this.nodes.values()).map((node) => ({ ...node })),
      edges: Array.from(this.edges.values()).map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        lengthKm: edge.lengthKm,
        speedLimitKph: edge.speedLimitKph,
        comfortableCapacity: edge.comfortableCapacity,
        maximumCapacity: edge.maximumCapacity,
        name: edge.name,
        major: edge.major
      }))
    };
    const graph = new TrafficGraph(config);
    for (const edge of this.edges.values()) Object.assign(graph.edge(edge.id), { ...edge });
    return graph;
  }

  edge(id: string): RoadEdge {
    const edge = this.edges.get(id);
    if (!edge) throw new Error(`Unknown edge: ${id}`);
    return edge;
  }

  node(id: string): TrafficNode {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Unknown node: ${id}`);
    return node;
  }

  outgoingEdges(nodeId: string): RoadEdge[] {
    return (this.outgoing.get(nodeId) ?? []).map((id) => this.edge(id));
  }

  resetCounts() {
    for (const edge of this.edges.values()) edge.currentVehicleCount = 0;
  }
}
