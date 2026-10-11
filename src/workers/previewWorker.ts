import { SimulationEngine } from "../simulation/core/SimulationEngine";
import type { ActionPreview, SimulationAction, SimulationSnapshot } from "../simulation/types";

export interface PreviewWorkerRequest {
  requestId: number;
  sessionId: number;
  snapshot: SimulationSnapshot;
  action: SimulationAction;
}

export interface PreviewWorkerResponse {
  requestId: number;
  sessionId: number;
  result?: ActionPreview;
  error?: string;
  timings: {
    roundTripStartedAt: number;
    calculationMs: number;
  };
}

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<PreviewWorkerRequest>) => void) | null;
  postMessage: (message: PreviewWorkerResponse) => void;
};

ctx.onmessage = (event: MessageEvent<PreviewWorkerRequest>) => {
  const { requestId, sessionId, snapshot, action } = event.data;
  const started = performance.now();
  try {
    const engine = new SimulationEngine(snapshot.scenario);
    engine.restoreFromSnapshot(snapshot);
    const result = engine.previewAction(action);
    ctx.postMessage({
      requestId,
      sessionId,
      result,
      timings: {
        roundTripStartedAt: started,
        calculationMs: performance.now() - started
      }
    } satisfies PreviewWorkerResponse);
  } catch (error) {
    ctx.postMessage({
      requestId,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
      timings: {
        roundTripStartedAt: started,
        calculationMs: performance.now() - started
      }
    } satisfies PreviewWorkerResponse);
  }
};
