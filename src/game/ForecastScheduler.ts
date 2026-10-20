import type { SimulationEngine } from "../simulation/core/SimulationEngine";
import type { TrafficForecast } from "../simulation/types";
import type { ForecastRequest, ForecastResponse } from "../workers/forecastWorker";

export interface ForecastView {
  status: "idle" | "loading" | "ready" | "error";
  session: number; revision: number; sourceTime: number | null; forecasts: TrafficForecast[]; error: string | null;
}
export const emptyForecast = (session = 0): ForecastView => ({ status: "idle", session, revision: 0, sourceTime: null, forecasts: [], error: null });
export interface ForecastSource { session: number; revision: number; time: number; interval: number; maxAge: number; engine: SimulationEngine; }

// One in-flight request and a single pending bit. Snapshots are created only at dispatch.
export class ForecastScheduler {
  private worker: Worker | null = null;
  private active: ForecastRequest | null = null;
  private pending = false;
  private epoch = 0;
  private counter = 0;
  private session = -1;
  private lastRequestedTime = -Infinity;
  constructor(private readonly source: () => ForecastSource, private readonly publish: (view: ForecastView) => void,
    private readonly factory: () => Worker, private readonly record?: (name: string, milliseconds: number) => void) {}
  reset() { this.worker?.terminate(); this.worker = null; this.active = null; this.pending = false; this.lastRequestedTime = -Infinity; this.epoch++; }
  update(invalidate = false) {
    const source = this.source();
    if (invalidate || source.session !== this.session) {
      this.reset(); this.session = source.session; this.publish(emptyForecast(source.session));
    }
    if (source.engine.isDone()) { this.reset(); this.publish(emptyForecast(source.session)); return; }
    const due = source.time - this.lastRequestedTime >= source.interval - 1e-8;
    if (!due) return;
    if (this.active) { this.pending = true; return; }
    this.dispatch(source);
  }
  private dispatch(source: ForecastSource) {
    const request: ForecastRequest = { kind: "forecast", requestId: ++this.counter, session: source.session, epoch: this.epoch,
      revision: source.revision, sourceTime: source.time, snapshot: source.engine.exportSnapshot() };
    this.lastRequestedTime = source.time;
    this.active = request;
    // Keep a valid older result visible while refreshing. Publishing loading alone is a store merge.
    this.publish({ ...emptyForecast(source.session), status: "loading", sourceTime: null, revision: source.revision });
    let worker: Worker;
    try { worker = this.worker ?? this.factory(); this.worker = worker; }
    catch (error) { this.active = null; this.publish({ ...emptyForecast(source.session), status: "error", error: error instanceof Error ? error.message : String(error) }); return; }
    const start = performance.now();
    worker.onmessage = event => {
      if (this.worker !== worker || this.active?.requestId !== request.requestId) return;
      const result = event.data as ForecastResponse;
      if (result.requestId !== request.requestId || result.session !== request.session || result.epoch !== request.epoch || result.revision !== request.revision || result.sourceTime !== request.sourceTime) return;
      this.active = null;
      this.record?.("forecastWorker", result.calculationMs); this.record?.("forecastRoundTrip", performance.now() - start);
      const current = this.source();
      if (current.session !== request.session || this.epoch !== request.epoch) return;
      if (result.error || !result.forecasts) this.publish({ ...emptyForecast(current.session), status: "error", error: result.error ?? "Forecast worker returned no data." });
      else if (current.time >= request.sourceTime && current.time - request.sourceTime <= current.maxAge + 1e-8) {
        this.publish({ status: "ready", session: request.session, revision: request.revision, sourceTime: request.sourceTime, forecasts: result.forecasts, error: null });
      } else this.pending = true;
      if (this.pending) { this.pending = false; this.update(); }
    };
    worker.onerror = event => {
      if (this.worker !== worker) return;
      worker.terminate(); this.worker = null; this.active = null; this.pending = false;
      this.publish({ ...emptyForecast(source.session), status: "error", error: event.message || "Forecast worker failed." });
    };
    worker.postMessage(request);
    this.record?.("snapshotPostMessage", performance.now() - start);
  }
  get queueSize() { return { active: this.active ? 1 : 0, pending: this.pending ? 1 : 0 }; }
}

export function forecastMaxAge(interval: number, _horizons: readonly number[]) { return interval; }
export function visibleForecasts(view: ForecastView, time: number, maxAge: number): TrafficForecast[] {
  if (view.sourceTime === null || time < view.sourceTime || time - view.sourceTime > maxAge + 1e-8) return [];
  const age = time - view.sourceTime;
  return view.forecasts.map(forecast => ({ ...forecast, samples: forecast.samples
    .map(sample => ({ ...sample, actualHorizonMinutes: Math.max(0, sample.actualHorizonMinutes - age) }))
    .filter((_sample, index) => forecast.samples[index].actualHorizonMinutes + 1e-8 >= age) })).filter(forecast => forecast.samples.length > 0);
}
