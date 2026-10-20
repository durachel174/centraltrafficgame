import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { createAlerts } from "../simulation/forecasting/TrafficPredictor";
import type { SimulationSnapshot, TrafficAlert, TrafficForecast } from "../simulation/types";
export interface ForecastRequest { kind: "forecast"; requestId: number; session: number; epoch: number; revision: number; sourceTime: number; snapshot: SimulationSnapshot; }
export interface ForecastResponse { requestId: number; session: number; epoch: number; revision: number; sourceTime: number; forecasts?: TrafficForecast[]; alerts?: TrafficAlert[]; error?: string; calculationMs: number; }
export function calculateForecast(request: ForecastRequest): ForecastResponse {
  const started = performance.now();
  const { requestId, session, epoch, revision, sourceTime, snapshot } = request;
  const engine = new SimulationEngine(snapshot.scenario); engine.restoreFromSnapshot(snapshot);
  const forecasts = engine.calculateForecasts();
  return { requestId, session, epoch, revision, sourceTime, forecasts, alerts: createAlerts(forecasts, snapshot.scenario.forecast), calculationMs: performance.now() - started };
}
const ctx = globalThis as unknown as { onmessage: (event: MessageEvent<ForecastRequest>) => void; postMessage: (result: ForecastResponse) => void };
if (typeof document === "undefined" && typeof self !== "undefined") ctx.onmessage = event => {
  try { ctx.postMessage(calculateForecast(event.data)); }
  catch (error) { const { snapshot: _snapshot, kind: _kind, ...metadata } = event.data; ctx.postMessage({ ...metadata, error: error instanceof Error ? error.message : String(error), calculationMs: 0 }); }
};
