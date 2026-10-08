export type NodeType =
  | "intersection"
  | "origin"
  | "destination"
  | "bridgeEntrance"
  | "bridgeExit";

export interface TrafficNode {
  id: string;
  x: number;
  y: number;
  type: NodeType;
  district?: string;
}

export interface RoadEdge {
  id: string;
  from: string;
  to: string;
  lengthKm: number;
  speedLimitKph: number;
  comfortableCapacity: number;
  maximumCapacity: number;
  currentVehicleCount: number;
  baseTravelTime: number;
  currentTravelTime: number;
  capacityModifier: number;
  closed: boolean;
  name?: string;
  major?: boolean;
}

export interface GraphConfig {
  nodes: TrafficNode[];
  edges: Omit<RoadEdge, "currentVehicleCount" | "baseTravelTime" | "currentTravelTime" | "capacityModifier" | "closed">[];
}
