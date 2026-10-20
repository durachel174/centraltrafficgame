import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { baselineIdentity } from "../simulation/logging/Identity";
import type { Scenario, SimulationMetrics } from "../simulation/types";

export interface BaselineRequest { kind: "baseline"; scenario: Scenario; seed: number; }
export interface BaselineResponse { identity: string; metrics?: SimulationMetrics; error?: string; calculationMs: number; }

export function calculateBaseline({ scenario, seed }: BaselineRequest): BaselineResponse {
  const start = performance.now();
  const engine = new SimulationEngine(scenario);
  engine.reset(seed);
  while (!engine.isDone()) engine.step();
  return { identity: baselineIdentity(scenario, seed), metrics: engine.getState().metrics, calculationMs: performance.now() - start };
}

const ctx = globalThis as unknown as { onmessage: ((event: MessageEvent<BaselineRequest>) => void) | null; postMessage: (message: BaselineResponse) => void };
if (typeof document === "undefined" && typeof self !== "undefined") ctx.onmessage = event => {
  try { ctx.postMessage(calculateBaseline(event.data)); }
  catch (error) { ctx.postMessage({ identity: baselineIdentity(event.data.scenario, event.data.seed), error: error instanceof Error ? error.message : String(error), calculationMs: 0 }); }
};
