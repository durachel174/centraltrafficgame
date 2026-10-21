import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { baselineIdentity } from "../simulation/logging/Identity";
import type { EvaluationState, Scenario, SimulationMetrics } from "../simulation/types";

export interface BaselineRequest { kind: "baseline"; scenario: Scenario; seed: number; }
export interface BaselineResponse { identity: string; metrics?: SimulationMetrics; evaluation?: EvaluationState; decisionCutoffMetrics?: SimulationMetrics | null; error?: string; calculationMs: number; }

export function calculateBaseline({ scenario, seed }: BaselineRequest): BaselineResponse {
  const start = performance.now();
  const engine = new SimulationEngine(scenario, undefined, true);
  engine.reset(seed);
  while (!engine.isDone()) engine.step();
  return { identity: baselineIdentity(scenario, seed), metrics: engine.getState().metrics, evaluation: engine.getEvaluation(), decisionCutoffMetrics: engine.getDecisionCutoffMetrics(), calculationMs: performance.now() - start };
}

const ctx = globalThis as unknown as { onmessage: ((event: MessageEvent<BaselineRequest>) => void) | null; postMessage: (message: BaselineResponse) => void };
if (typeof document === "undefined" && typeof self !== "undefined") ctx.onmessage = event => {
  try { ctx.postMessage(calculateBaseline(event.data)); }
  catch (error) { ctx.postMessage({ identity: baselineIdentity(event.data.scenario, event.data.seed), error: error instanceof Error ? error.message : String(error), calculationMs: 0 }); }
};
