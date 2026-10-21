import { describe, expect, it, vi } from "vitest";
import { createAlerts } from "../simulation/forecasting/TrafficPredictor";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { ForecastScheduler, forecastMaxAge, visibleForecasts, type ForecastSource, type ForecastView } from "../game/ForecastScheduler";
import { calculateForecast, type ForecastRequest } from "../workers/forecastWorker";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import { finalStateChecksum, createCompletedRun, verifyCompletedRun, parseRunFile } from "../simulation/logging/RunFile";
import type { Scenario } from "../simulation/types";

const scenario: Scenario = { ...mondayMorningScenario, evaluation: undefined, id: "worker_fixture", endTime: 450,
  demand: { ...mondayMorningScenario.demand, curve: [{ minute: 0, tripsPerMinute: 0 }, { minute: 30, tripsPerMinute: 0 }] },
  forecast: { ...mondayMorningScenario.forecast!, refreshIntervalMinutes: 1, horizonsMinutes: [1, 2, 3], previewHorizonMinutes: 3 }, events: [] };
class WorkerDouble {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: ForecastRequest[] = [];
  terminated = false;
  postMessage(request: ForecastRequest) { this.requests.push(request); }
  terminate() { this.terminated = true; }
  reply(index = this.requests.length - 1) { this.onmessage?.({ data: calculateForecast(this.requests[index]) } as MessageEvent); }
}
function setup() {
  const engine = new SimulationEngine(scenario, undefined, true); engine.reset(22);
  let session = 1, revision = 0;
  const views: ForecastView[] = [], workers: WorkerDouble[] = [];
  const source = (): ForecastSource => ({ session, revision, time: engine.getState().time, interval: 1, maxAge: 1, engine });
  const scheduler = new ForecastScheduler(source, view => views.push(view), () => { const worker = new WorkerDouble(); workers.push(worker); return worker as unknown as Worker; });
  const advance = (ticks = 1) => { for (let i = 0; i < ticks; i++) { engine.step(); revision++; scheduler.update(); } };
  return { engine, views, workers, scheduler, advance, newSession: () => { session++; revision = 0; engine.reset(22); scheduler.update(); } };
}
describe("source-labelled asynchronous forecasts", () => {
  it("worker values match synchronous forecasting from the identical source snapshot", () => {
    const test = setup(); test.engine.step({ type: "DEBUG_SPAWN", count: 100 }); test.scheduler.update();
    const request = test.workers[0].requests[0];
    const sync = new SimulationEngine(scenario); sync.restoreFromSnapshot(request.snapshot);
    const before = test.engine.exportSnapshot();
    expect(calculateForecast(request).forecasts).toEqual(sync.calculateForecasts());
    expect(test.engine.exportSnapshot()).toEqual(before);
  });
  it("accepts an older revision within one configured interval, with truthful rebased horizons", () => {
    const test = setup(); test.scheduler.update(); test.advance(3); test.workers[0].reply();
    const ready = test.views.at(-1)!;
    expect(ready.status).toBe("ready"); expect(ready.revision).toBe(0); expect(ready.sourceTime).toBe(0);
    const forecasts = visibleForecasts(ready, 0.75, 1);
    expect(forecasts[0].samples.map(sample => sample.actualHorizonMinutes)).toEqual([0.25, 1.25, 2.25]);
    expect(visibleForecasts(ready, 1.25, 1)).toEqual([]);
    expect(forecastMaxAge(5, [5, 10, 15])).toBe(5);
  });
  it("cannot resurrect a passed warning through legacy utilization fields", () => {
    const test = setup(); const forecast = test.engine.calculateForecasts()[0];
    const modified = { ...forecast, utilization5m: 2, utilization10m: 0.5, utilization15m: 0.5,
      samples: forecast.samples.map((sample, index) => ({ ...sample, utilization: index === 0 ? 2 : 0.5 })) };
    const remaining = visibleForecasts({ status: "ready", session: 1, revision: 0, sourceTime: 0, forecasts: [modified], error: null }, 1.5, 2);
    expect(remaining[0].samples.map(sample => sample.actualHorizonMinutes)).toEqual([0.5, 1.5]);
    expect(createAlerts(remaining)).toEqual([]);
  });
  it("rejects late sessions and invalidated-action responses and terminates obsolete workers", () => {
    const test = setup(); test.scheduler.update(); const old = test.workers[0];
    test.engine.step({ type: "DEBUG_INCIDENT", edgeId: "north_bridge", capacityModifier: 0.6, durationMinutes: 5 });
    test.scheduler.update(true); old.reply();
    expect(old.terminated).toBe(true); expect(test.views.at(-1)!.status).toBe("loading");
    const beforeReset = test.workers.at(-1)!; test.newSession(); beforeReset.reply();
    expect(beforeReset.terminated).toBe(true); expect(test.views.at(-1)!.session).toBe(2);
    expect(test.views.filter(view => view.status === "ready")).toHaveLength(0);
  });
  it("coalesces any number of due ticks into one latest request and takes no queued snapshots", () => {
    const test = setup(); const snapshot = vi.spyOn(test.engine, "exportSnapshot"); test.scheduler.update(); test.advance(40);
    expect(test.scheduler.queueSize).toEqual({ active: 1, pending: 1 }); expect(snapshot).toHaveBeenCalledTimes(1);
    test.workers[0].reply(0);
    expect(snapshot).toHaveBeenCalledTimes(2); expect(test.workers[0].requests).toHaveLength(2);
    expect(test.workers[0].requests[1].sourceTime).toBe(10);
    test.workers[0].reply(1); expect(test.views.at(-1)!.sourceTime).toBe(10);
  });
  it("worker timing and forecast caches cannot change authoritative state, rewards, or verified replay", () => {
    const sync = new SimulationEngine(scenario); const async = new SimulationEngine(scenario, undefined, true);
    sync.reset(32); async.reset(32);
    for (let tick = 0; !sync.isDone(); tick++) {
      const action = tick === 5 ? { type: "DEBUG_SPAWN" as const, count: 10 } : { type: "NO_OP" as const };
      expect(async.step(action).reward).toBe(sync.step(action).reward);
      if (tick % 9 === 0) {
        const result = calculateForecast({ kind: "forecast", requestId: tick, session: 1, epoch: 0, revision: tick, sourceTime: async.getState().time, snapshot: async.exportSnapshot() });
        expect(result.forecasts).toBeTruthy();
      }
    }
    expect(async.createRun()).toEqual(sync.createRun());
    expect(finalStateChecksum(async.exportSnapshot())).toBe(finalStateChecksum(sync.exportSnapshot()));
    const exported = createCompletedRun(async); expect(verifyCompletedRun(sync, exported)).toBeNull();
    expect(() => parseRunFile(JSON.stringify({ ...exported, engineVersion: "0.2.0" }), scenario)).toThrow("Incompatible engine");
  });
});
