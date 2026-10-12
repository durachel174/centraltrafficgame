import { create } from "zustand";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import { practiceCheckpointTicks, practiceScenario } from "../simulation/scenarios/PracticeScenario";
import type { ActionPreview, Scenario, SimulationAction } from "../simulation/types";
import type { PreviewWorkerRequest, PreviewWorkerResponse } from "../workers/previewWorker";

export type Speed = 0 | 1 | 2 | 4;
export type ScenarioMode = "practice" | "monday";
export type TutorialStep =
  | "goal"
  | "inspect"
  | "forecast"
  | "preview"
  | "review"
  | "observe"
  | "hold"
  | "done";

export interface TutorialState {
  active: boolean;
  completed: boolean;
  step: TutorialStep;
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
  clearActionNotice: () => void;
}

const scenarioByMode: Record<ScenarioMode, Scenario> = {
  practice: practiceScenario,
  monday: mondayMorningScenario
};

const tutorialSteps: TutorialStep[] = ["goal", "inspect", "forecast", "preview", "review", "observe", "hold", "done"];

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
  selectedEdgeId: hasCompletedTutorial() ? null : "north_bridge",
  baselineObjective: null,
  devToolsOpen: false,
  lastActionNotice: null,
  tutorial: { active: !hasCompletedTutorial(), completed: hasCompletedTutorial(), step: hasCompletedTutorial() ? "done" : "goal" },
  preview: idlePreview(),
  setSpeed: (speed) => set({ speed }),
  toggleDevTools: () => set((state) => ({ devToolsOpen: !state.devToolsOpen })),
  setScenarioMode: (scenarioMode) => {
    stopActiveWorker();
    previewCache.clear();
    sessionCounter += 1;
    requestCounter += 1;
    const scenario = scenarioByMode[scenarioMode];
    set({
      scenario,
      scenarioMode,
      engine: createEngine(scenario),
      version: 0,
      speed: scenarioMode === "practice" ? 0 : 1,
      selectedEdgeId: scenarioMode === "practice" ? "north_bridge" : null,
      baselineObjective: null,
      preview: idlePreview(requestCounter, sessionCounter),
      lastActionNotice: null
    });
    get().computeBaseline();
  },
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
    const { scenario, scenarioMode, tutorial } = get();
    set({
      engine: createEngine(scenario),
      version: 0,
      speed: scenarioMode === "practice" && tutorial.active ? 0 : get().speed,
      selectedEdgeId: scenarioMode === "practice" ? "north_bridge" : null,
      preview: idlePreview(requestCounter, sessionCounter),
      lastActionNotice: null
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
    set({
      speed: 0,
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
    const affected = preview.result?.affectedVehicles ?? 0;
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
      }
    }));
    step(action);
  },
  advanceTutorial: () => {
    set((state) => {
      const index = tutorialSteps.indexOf(state.tutorial.step);
      const nextStep = tutorialSteps[Math.min(index + 1, tutorialSteps.length - 1)];
      const completed = nextStep === "done";
      if (completed) saveTutorialComplete();
      return {
        tutorial: { active: !completed, completed: state.tutorial.completed || completed, step: nextStep },
        speed: nextStep === "observe" ? state.speed : 0
      };
    });
  },
  skipTutorial: () => {
    saveTutorialComplete();
    set({ tutorial: { active: false, completed: true, step: "done" }, speed: 1 });
  },
  replayTutorial: () => {
    get().setScenarioMode("practice");
    set({ tutorial: { active: true, completed: false, step: "goal" }, speed: 0, selectedEdgeId: "north_bridge" });
  },
  clearActionNotice: () => set({ lastActionNotice: null })
}));
