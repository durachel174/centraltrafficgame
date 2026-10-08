import { create } from "zustand";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import type { SimulationAction } from "../simulation/types";

export type Speed = 0 | 1 | 2 | 4;

interface GameStore {
  engine: SimulationEngine;
  version: number;
  speed: Speed;
  selectedEdgeId: string | null;
  baselineObjective: number | null;
  setSpeed: (speed: Speed) => void;
  selectEdge: (edgeId: string | null) => void;
  step: (action?: SimulationAction) => void;
  reset: () => void;
  computeBaseline: () => void;
}

const createEngine = () => {
  const engine = new SimulationEngine(mondayMorningScenario);
  engine.reset(mondayMorningScenario.seed);
  return engine;
};

export const useGameStore = create<GameStore>((set, get) => ({
  engine: createEngine(),
  version: 0,
  speed: 1,
  selectedEdgeId: null,
  baselineObjective: null,
  setSpeed: (speed) => set({ speed }),
  selectEdge: (selectedEdgeId) => set({ selectedEdgeId }),
  step: (action = { type: "NO_OP" }) => {
    get().engine.step(action);
    set((state) => ({ version: state.version + 1 }));
  },
  reset: () => set({ engine: createEngine(), version: 0, selectedEdgeId: null }),
  computeBaseline: () => {
    const baseline = createEngine();
    while (!baseline.isDone()) baseline.step({ type: "NO_OP" });
    set({ baselineObjective: baseline.getState().metrics.objective });
  }
}));
