import { create } from "zustand";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import type { ActionPreview, SimulationAction } from "../simulation/types";

export type Speed = 0 | 1 | 2 | 4;

interface GameStore {
  engine: SimulationEngine;
  version: number;
  speed: Speed;
  selectedEdgeId: string | null;
  baselineObjective: number | null;
  preview: {
    status: "idle" | "loading" | "ready" | "stale";
    action: SimulationAction | null;
    result: ActionPreview | null;
    baseVersion: number | null;
    requestId: number;
  };
  setSpeed: (speed: Speed) => void;
  selectEdge: (edgeId: string | null) => void;
  step: (action?: SimulationAction) => void;
  reset: () => void;
  computeBaseline: () => void;
  requestPreview: (action: SimulationAction) => void;
  cancelPreview: () => void;
  confirmPreview: () => void;
}

const createEngine = () => {
  const engine = new SimulationEngine(mondayMorningScenario);
  engine.reset(mondayMorningScenario.seed);
  return engine;
};

const previewCache = new Map<string, ActionPreview>();
const previewKey = (version: number, action: SimulationAction) => `${version}:${JSON.stringify(action)}`;

export const useGameStore = create<GameStore>((set, get) => ({
  engine: createEngine(),
  version: 0,
  speed: 1,
  selectedEdgeId: null,
  baselineObjective: null,
  preview: { status: "idle", action: null, result: null, baseVersion: null, requestId: 0 },
  setSpeed: (speed) => set({ speed }),
  selectEdge: (selectedEdgeId) => set({ selectedEdgeId }),
  step: (action = { type: "NO_OP" }) => {
    get().engine.step(action);
    set((state) => ({
      version: state.version + 1,
      preview: state.preview.status === "idle" ? state.preview : { ...state.preview, status: "stale" }
    }));
  },
  reset: () =>
    set({
      engine: createEngine(),
      version: 0,
      selectedEdgeId: null,
      preview: { status: "idle", action: null, result: null, baseVersion: null, requestId: 0 }
    }),
  computeBaseline: () => {
    const baseline = createEngine();
    while (!baseline.isDone()) baseline.step({ type: "NO_OP" });
    set({ baselineObjective: baseline.getState().metrics.objective });
  },
  requestPreview: (action) => {
    const { engine, version, preview } = get();
    const requestId = preview.requestId + 1;
    const key = previewKey(version, action);
    const cached = previewCache.get(key);
    set({
      speed: 0,
      preview: {
        status: cached ? "ready" : "loading",
        action: { ...action },
        result: cached ?? null,
        baseVersion: version,
        requestId
      }
    });
    if (cached) return;
    window.setTimeout(() => {
      const result = engine.previewAction(action);
      previewCache.set(key, result);
      const current = get().preview;
      if (current.requestId !== requestId || current.baseVersion !== version || JSON.stringify(current.action) !== JSON.stringify(action)) {
        return;
      }
      if (get().version !== version) {
        set({ preview: { ...current, status: "stale", result } });
        return;
      }
      set({ preview: { ...current, status: "ready", result } });
    }, 0);
  },
  cancelPreview: () => {
    set((state) => ({
      preview: { status: "idle", action: null, result: null, baseVersion: null, requestId: state.preview.requestId + 1 }
    }));
  },
  confirmPreview: () => {
    const { preview, version, step } = get();
    if (preview.status !== "ready" || !preview.action || preview.baseVersion !== version) {
      set({ preview: { ...preview, status: "stale" } });
      return;
    }
    const action = { ...preview.action };
    set((state) => ({
      preview: { status: "idle", action: null, result: null, baseVersion: null, requestId: state.preview.requestId + 1 }
    }));
    step(action);
  }
}));
