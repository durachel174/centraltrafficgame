import { create } from "zustand";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import type { ActionPreview, SimulationAction } from "../simulation/types";
import type { PreviewWorkerRequest, PreviewWorkerResponse } from "../workers/previewWorker";

export type Speed = 0 | 1 | 2 | 4;

interface GameStore {
  engine: SimulationEngine;
  version: number;
  speed: Speed;
  selectedEdgeId: string | null;
  baselineObjective: number | null;
  preview: {
    status: "idle" | "loading" | "ready" | "stale" | "error";
    action: SimulationAction | null;
    result: ActionPreview | null;
    baseVersion: number | null;
    baseSessionId: number;
    requestId: number;
    targetEdgeId: string | null;
    error: string | null;
    timings: { roundTripMs: number; calculationMs: number } | null;
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

const maxPreviewCacheEntries = 20;
const previewCache = new Map<string, ActionPreview>();
let sessionCounter = 1;
let requestCounter = 0;
let activePreviewWorker: Worker | null = null;

const cloneAction = <T extends SimulationAction>(action: T): T => ({ ...action }) as T;
const previewKey = (sessionId: number, version: number, action: SimulationAction) => `${sessionId}:${version}:${JSON.stringify(action)}`;
const targetEdgeForAction = (action: SimulationAction) => ("targetEdge" in action ? (action.targetEdge ?? null) : null);
const idlePreview = (requestId = requestCounter, sessionId = sessionCounter): GameStore["preview"] => ({
  status: "idle",
  action: null,
  result: null,
  baseVersion: null,
  baseSessionId: sessionId,
  requestId,
  targetEdgeId: null,
  error: null,
  timings: null
});

const rememberPreview = (key: string, result: ActionPreview) => {
  if (previewCache.has(key)) previewCache.delete(key);
  previewCache.set(key, result);
  while (previewCache.size > maxPreviewCacheEntries) {
    const oldest = previewCache.keys().next().value;
    if (oldest === undefined) break;
    previewCache.delete(oldest);
  }
};

const stopActiveWorker = () => {
  activePreviewWorker?.terminate();
  activePreviewWorker = null;
};

const createPreviewWorker = () => {
  if (typeof Worker === "undefined") throw new Error("Preview worker is unavailable in this browser.");
  return new Worker(new URL("../workers/previewWorker.ts", import.meta.url), { type: "module" });
};

export const useGameStore = create<GameStore>((set, get) => ({
  engine: createEngine(),
  version: 0,
  speed: 1,
  selectedEdgeId: null,
  baselineObjective: null,
  preview: idlePreview(),
  setSpeed: (speed) => set({ speed }),
  selectEdge: (selectedEdgeId) =>
    set((state) => {
      if (state.preview.status === "idle" || state.preview.targetEdgeId === selectedEdgeId) return { selectedEdgeId };
      stopActiveWorker();
      requestCounter += 1;
      return { selectedEdgeId, preview: idlePreview(requestCounter, sessionCounter) };
    }),
  step: (action = { type: "NO_OP" }) => {
    get().engine.step(action);
    set((state) => ({
      version: state.version + 1,
      preview: state.preview.status === "idle" ? state.preview : { ...state.preview, status: "stale" }
    }));
  },
  reset: () => {
    stopActiveWorker();
    previewCache.clear();
    sessionCounter += 1;
    requestCounter += 1;
    set({
      engine: createEngine(),
      version: 0,
      selectedEdgeId: null,
      preview: idlePreview(requestCounter, sessionCounter)
    });
  },
  computeBaseline: () => {
    const baseline = createEngine();
    while (!baseline.isDone()) baseline.step({ type: "NO_OP" });
    set({ baselineObjective: baseline.getState().metrics.objective });
  },
  requestPreview: (action) => {
    stopActiveWorker();
    const { engine, version } = get();
    const copiedAction = cloneAction(action);
    const requestId = ++requestCounter;
    const sessionId = sessionCounter;
    const key = previewKey(sessionId, version, copiedAction);
    const cached = previewCache.get(key);
    set({
      speed: 0,
      preview: {
        status: cached ? "ready" : "loading",
        action: copiedAction,
        result: cached ?? null,
        baseVersion: version,
        baseSessionId: sessionId,
        requestId,
        targetEdgeId: targetEdgeForAction(copiedAction),
        error: null,
        timings: null
      }
    });
    if (cached) return;
    let worker: Worker;
    try {
      worker = createPreviewWorker();
    } catch (error) {
      const current = get().preview;
      if (current.requestId === requestId && current.baseSessionId === sessionId) {
        set({ preview: { ...current, status: "error", error: error instanceof Error ? error.message : String(error) } });
      }
      return;
    }
    activePreviewWorker = worker;
    const roundTripStart = performance.now();
    worker.onmessage = (event: MessageEvent<PreviewWorkerResponse>) => {
      const message = event.data;
      worker.terminate();
      if (activePreviewWorker === worker) activePreviewWorker = null;
      const current = get().preview;
      const sameRequest =
        current.requestId === message.requestId &&
        current.baseSessionId === message.sessionId &&
        current.baseVersion === version &&
        JSON.stringify(current.action) === JSON.stringify(copiedAction);
      if (!sameRequest || sessionCounter !== sessionId || get().version !== version) return;
      if (message.error || !message.result) {
        set({
          preview: {
            ...current,
            status: "error",
            error: message.error ?? "Preview worker returned no result.",
            timings: { roundTripMs: performance.now() - roundTripStart, calculationMs: message.timings.calculationMs }
          }
        });
        return;
      }
      rememberPreview(key, message.result);
      set({
        preview: {
          ...current,
          status: "ready",
          result: message.result,
          timings: { roundTripMs: performance.now() - roundTripStart, calculationMs: message.timings.calculationMs }
        }
      });
    };
    worker.onerror = (event) => {
      worker.terminate();
      if (activePreviewWorker === worker) activePreviewWorker = null;
      const current = get().preview;
      if (current.requestId === requestId && current.baseSessionId === sessionId && get().version === version) {
        set({
          preview: {
            ...current,
            status: "error",
            error: event.message || "Preview worker failed.",
            timings: { roundTripMs: performance.now() - roundTripStart, calculationMs: 0 }
          }
        });
      }
    };
    worker.postMessage({
      requestId,
      sessionId,
      snapshot: engine.exportSnapshot(),
      action: copiedAction
    } satisfies PreviewWorkerRequest);
  },
  cancelPreview: () => {
    stopActiveWorker();
    requestCounter += 1;
    set((state) => ({
      preview: idlePreview(Math.max(requestCounter, state.preview.requestId + 1), sessionCounter)
    }));
  },
  confirmPreview: () => {
    const { preview, version, step } = get();
    if (preview.status !== "ready" || !preview.action || preview.baseVersion !== version || preview.baseSessionId !== sessionCounter) {
      set({ preview: { ...preview, status: "stale" } });
      return;
    }
    const action = cloneAction(preview.action);
    requestCounter += 1;
    set((state) => ({
      preview: idlePreview(Math.max(requestCounter, state.preview.requestId + 1), sessionCounter)
    }));
    step(action);
  }
}));
