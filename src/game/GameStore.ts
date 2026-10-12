import { create } from "zustand";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import { practiceCheckpointTicks, practiceScenario } from "../simulation/scenarios/PracticeScenario";
import type { ActionPreview, Scenario, SimulationAction } from "../simulation/types";
import type { PreviewWorkerRequest, PreviewWorkerResponse } from "../workers/previewWorker";

export type Speed = 0 | 1 | 2 | 4;
export type ScenarioMode = "practice" | "monday";
export type TutorialStep =
  | "intro"
  | "select"
  | "forecast"
  | "preview"
  | "review"
  | "observe"
  | "hold"
  | "complete";

export interface TutorialState {
  active: boolean;
  completed: boolean;
  step: TutorialStep;
  observedFromTime: number | null;
  observationStart: { northBridgeVehicles: number; southBridgeVehicles: number } | null;
  observationSummary: string | null;
  message: string | null;
}

interface GameStore {
  engine: SimulationEngine;
  scenario: Scenario;
  scenarioMode: ScenarioMode;
  version: number;
  speed: Speed;
  selectedEdgeId: string | null;
  baselineObjective: number | null;
  devToolsOpen: boolean;
  lastActionNotice: { text: string; affected: number; actionType: SimulationAction["type"] } | null;
  tutorial: TutorialState;
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
  toggleDevTools: () => void;
  setScenarioMode: (mode: ScenarioMode) => void;
  selectEdge: (edgeId: string | null) => void;
  step: (action?: SimulationAction) => void;
  reset: () => void;
  computeBaseline: () => void;
  requestPreview: (action: SimulationAction) => void;
  cancelPreview: () => void;
  confirmPreview: () => void;
  advanceTutorial: () => void;
  skipTutorial: () => void;
  replayTutorial: () => void;
  finishTutorial: (destination: "practice" | "monday") => void;
  clearActionNotice: () => void;
}

const scenarioByMode: Record<ScenarioMode, Scenario> = {
  practice: practiceScenario,
  monday: mondayMorningScenario
};

const observationMinutes = 2.5;

const tutorialStorageKey = "centralTrafficTutorialComplete";
const hasCompletedTutorial = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem?.(tutorialStorageKey) === "1";
  } catch {
    return false;
  }
};

const saveTutorialComplete = () => {
  try {
    if (typeof window !== "undefined") window.localStorage?.setItem?.(tutorialStorageKey, "1");
  } catch {
    // Persistence is optional; gameplay and tests should keep running without storage.
  }
};

const createEngine = (scenario: Scenario) => {
  const engine = new SimulationEngine(scenario);
  engine.reset(scenario.seed);
  if (scenario.id === practiceScenario.id) {
    for (let i = 0; i < practiceCheckpointTicks; i++) engine.step({ type: "NO_OP" });
  }
  return engine;
};

const initialTutorial = (active: boolean, completed: boolean): TutorialState => ({
  active,
  completed,
  step: active ? "intro" : "complete",
  observedFromTime: null,
  observationStart: null,
  observationSummary: null,
  message: null
});

const completeTutorial = (): TutorialState => ({
  active: false,
  completed: true,
  step: "complete",
  observedFromTime: null,
  observationStart: null,
  observationSummary: null,
  message: null
});

const maxPreviewCacheEntries = 20;
const previewCache = new Map<string, ActionPreview>();
let sessionCounter = 1;
let requestCounter = 0;
let activePreviewWorker: Worker | null = null;

const cloneAction = <T extends SimulationAction>(action: T): T => ({ ...action }) as T;
const clonePreview = (preview: ActionPreview): ActionPreview => ({
  ...preview,
  forecastChanges: preview.forecastChanges.map((change) => ({ ...change }))
});
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
  previewCache.set(key, clonePreview(result));
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
  scenario: hasCompletedTutorial() ? mondayMorningScenario : practiceScenario,
  scenarioMode: hasCompletedTutorial() ? "monday" : "practice",
  engine: createEngine(hasCompletedTutorial() ? mondayMorningScenario : practiceScenario),
  version: 0,
  speed: hasCompletedTutorial() ? 1 : 0,
  selectedEdgeId: null,
  baselineObjective: null,
  devToolsOpen: false,
  lastActionNotice: null,
  tutorial: initialTutorial(!hasCompletedTutorial(), hasCompletedTutorial()),
  preview: idlePreview(),
  setSpeed: (speed) => set({ speed }),
  toggleDevTools: () => set((state) => ({ devToolsOpen: !state.devToolsOpen })),
  setScenarioMode: (scenarioMode) => {
    stopActiveWorker();
    previewCache.clear();
    sessionCounter += 1;
    requestCounter += 1;
    const scenario = scenarioByMode[scenarioMode];
    const completed = hasCompletedTutorial() || get().tutorial.completed;
    set({
      scenario,
      scenarioMode,
      engine: createEngine(scenario),
      version: 0,
      speed: scenarioMode === "practice" ? 0 : 1,
      selectedEdgeId: null,
      baselineObjective: null,
      preview: idlePreview(requestCounter, sessionCounter),
      lastActionNotice: null,
      tutorial: scenarioMode === "monday" ? completeTutorial() : initialTutorial(!completed, completed)
    });
    get().computeBaseline();
  },
  selectEdge: (selectedEdgeId) =>
    set((state) => {
      const tutorial =
        state.tutorial.active && state.tutorial.step === "select" && selectedEdgeId === "north_bridge"
          ? { ...state.tutorial, step: "forecast" as const, message: null }
          : state.tutorial.active && state.tutorial.step !== "intro" && selectedEdgeId !== "north_bridge"
            ? { ...state.tutorial, message: "Choose North Bridge to continue the practice lesson, or Skip to play freely." }
            : state.tutorial;
      if (state.preview.status === "idle" || state.preview.targetEdgeId === selectedEdgeId) return { selectedEdgeId, tutorial };
      stopActiveWorker();
      requestCounter += 1;
      return { selectedEdgeId, preview: idlePreview(requestCounter, sessionCounter), tutorial };
    }),
  step: (action = { type: "NO_OP" }) => {
    get().engine.step(action);
    set((state) => {
      const observationComplete =
        state.tutorial.active &&
        state.tutorial.step === "observe" &&
        state.tutorial.observedFromTime !== null &&
        get().engine.getObservation().time - state.tutorial.observedFromTime >= observationMinutes;
      const northVehicles = get().engine.getState().graph.edge("north_bridge").currentVehicleCount;
      const southVehicles = get().engine.getState().graph.edge("south_bridge").currentVehicleCount;
      return {
        version: state.version + 1,
        speed: observationComplete ? 0 : state.speed,
        preview: state.preview.status === "idle" ? state.preview : { ...state.preview, status: "stale" },
        tutorial: observationComplete
          ? {
              ...state.tutorial,
              step: "hold",
              observationSummary: `The city advanced ${observationMinutes.toFixed(1)} simulated minutes. North Bridge now has ${northVehicles} vehicles, and South Bridge has ${southVehicles}.`
            }
          : state.tutorial
      };
    });
  },
  reset: () => {
    stopActiveWorker();
    previewCache.clear();
    sessionCounter += 1;
    requestCounter += 1;
    const { scenario, scenarioMode, tutorial } = get();
    set({
      engine: createEngine(scenario),
      version: 0,
      speed: scenarioMode === "practice" && tutorial.active ? 0 : get().speed,
      selectedEdgeId: null,
      preview: idlePreview(requestCounter, sessionCounter),
      lastActionNotice: null,
      tutorial: tutorial.active ? initialTutorial(true, tutorial.completed) : tutorial
    });
  },
  computeBaseline: () => {
    const baseline = createEngine(get().scenario);
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
    const activeTutorial = get().tutorial;
    set({
      speed: 0,
      tutorial:
        activeTutorial.active && activeTutorial.step === "preview" && copiedAction.type === "REROUTE" && targetEdgeForAction(copiedAction) === "north_bridge"
          ? cached
            ? cached.affectedVehicles > 0
              ? { ...activeTutorial, step: "review", message: null }
              : { ...activeTutorial, message: "No eligible vehicles changed in that preview. Try again, reset, or Skip." }
            : { ...activeTutorial, message: null }
          : activeTutorial.active && activeTutorial.step === "preview"
            ? { ...activeTutorial, message: "Preview a North Bridge reroute to continue, or Skip to play freely." }
            : activeTutorial,
      preview: {
        status: cached ? "ready" : "loading",
        action: copiedAction,
        result: cached ? clonePreview(cached) : null,
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
          tutorial:
            get().tutorial.active && get().tutorial.step === "preview"
              ? { ...get().tutorial, message: "Preview failed. Try again, reset, or Skip." }
              : get().tutorial,
          preview: {
            ...current,
            status: "error",
            error: message.error ?? "Preview worker returned no result.",
            timings: { roundTripMs: performance.now() - roundTripStart, calculationMs: message.timings.calculationMs }
          }
        });
        return;
      }
      const result = clonePreview(message.result);
      rememberPreview(key, result);
      set({
        tutorial:
          get().tutorial.active && get().tutorial.step === "preview" && result.affectedVehicles > 0
            ? { ...get().tutorial, step: "review", message: null }
            : get().tutorial.active && get().tutorial.step === "preview"
              ? { ...get().tutorial, message: "No eligible vehicles changed in that preview. Try again, reset, or Skip." }
              : get().tutorial,
        preview: {
          ...current,
          status: "ready",
          result,
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
          tutorial:
            get().tutorial.active && get().tutorial.step === "preview"
              ? { ...get().tutorial, message: "Preview failed. Try again, reset, or Skip." }
              : get().tutorial,
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
      preview: idlePreview(Math.max(requestCounter, state.preview.requestId + 1), sessionCounter),
      tutorial: state.tutorial.active && state.tutorial.step === "review" ? { ...state.tutorial, step: "preview", message: "Preview canceled. Try the reroute again, or Skip." } : state.tutorial
    }));
  },
  confirmPreview: () => {
    const { preview, version, step, engine, tutorial } = get();
    if (preview.status !== "ready" || !preview.action || preview.baseVersion !== version || preview.baseSessionId !== sessionCounter) {
      set({ preview: { ...preview, status: "stale" } });
      return;
    }
    const action = cloneAction(preview.action);
    const affected = preview.result?.affectedVehicles ?? 0;
    const beforeNorth = engine.getState().graph.edge("north_bridge").currentVehicleCount;
    const beforeSouth = engine.getState().graph.edge("south_bridge").currentVehicleCount;
    requestCounter += 1;
    set((state) => ({
      preview: idlePreview(Math.max(requestCounter, state.preview.requestId + 1), sessionCounter),
      lastActionNotice: {
        text:
          action.type === "REROUTE"
            ? "Reroute applied"
            : action.type === "DELAY_DEPARTURES"
              ? "Departure hold applied"
              : "Action applied",
        affected,
        actionType: action.type
      },
      tutorial:
        tutorial.active && tutorial.step === "review"
          ? {
              ...tutorial,
              step: "observe",
              observedFromTime: engine.getObservation().time,
              observationStart: { northBridgeVehicles: beforeNorth, southBridgeVehicles: beforeSouth },
              message: null
            }
          : tutorial
    }));
    step(action);
  },
  advanceTutorial: () => {
    set((state) => {
      if (!state.tutorial.active) return {};
      if (state.tutorial.step === "intro") return { tutorial: { ...state.tutorial, step: "select", message: null }, speed: 0 };
      if (state.tutorial.step === "forecast") return { tutorial: { ...state.tutorial, step: "preview", message: null }, speed: 0 };
      if (state.tutorial.step === "hold") return { tutorial: { ...state.tutorial, step: "complete", message: null }, speed: 0 };
      return { tutorial: { ...state.tutorial, message: "Use the highlighted control to continue, or Skip to play freely." } };
    });
  },
  skipTutorial: () => {
    saveTutorialComplete();
    set({ tutorial: completeTutorial(), speed: 0 });
  },
  replayTutorial: () => {
    get().setScenarioMode("practice");
    set({ tutorial: initialTutorial(true, false), speed: 0, selectedEdgeId: null });
  },
  finishTutorial: (destination) => {
    saveTutorialComplete();
    set({ tutorial: completeTutorial(), speed: 0 });
    if (destination === "monday") get().setScenarioMode("monday");
  },
  clearActionNotice: () => set({ lastActionNotice: null })
}));
