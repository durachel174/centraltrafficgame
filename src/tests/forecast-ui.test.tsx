import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useGameStore } from "../game/GameStore";
import { RoadInspector } from "../components/RoadInspector";
import { AlertPanel } from "../components/AlertPanel";
import { calculateForecast } from "../workers/forecastWorker";
class WorkerDouble {
  static all: WorkerDouble[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  message: any;
  terminated = false;
  constructor() { WorkerDouble.all.push(this); }
  postMessage(message: any) { this.message = message; }
  terminate() { this.terminated = true; }
  reply() { act(() => this.onmessage?.({ data: calculateForecast(this.message) } as MessageEvent)); }
}
afterEach(() => { useGameStore.getState().setScenarioMode("practice"); vi.unstubAllGlobals(); });
it("shows source age and rebased horizons during playback, and Retry doesn't alter the engine", () => {
  vi.stubGlobal("Worker", WorkerDouble); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useGameStore.getState().setScenarioMode("monday", 21);
  const worker = WorkerDouble.all.filter(item => item.message.kind === "forecast").at(-1)!;
  const host = document.createElement("div"); const root = createRoot(host);
  act(() => root.render(<><RoadInspector /><AlertPanel /></>));
  expect(host.textContent).toContain("no fresh projection");
  worker.reply();
  expect(host.textContent).toContain("Forecast source 07:00:00");
  act(() => useGameStore.getState().step());
  expect(host.textContent).toContain("0.25 min old");
  expect(host.textContent).toContain("+4.75m");
  act(() => useGameStore.getState().step({ type: "DEBUG_INCIDENT", edgeId: "north_bridge", capacityModifier: 0.6, durationMinutes: 5 }));
  expect(worker.terminated).toBe(true);
  expect(host.textContent).not.toContain("Forecast source 07:00:00");
  const current = WorkerDouble.all.filter(item => item.message.kind === "forecast").at(-1)!;
  act(() => current.onerror?.({ message: "Test forecast failure" } as ErrorEvent));
  expect(host.textContent).toContain("Forecast unavailable: Test forecast failure");
  const snapshot = useGameStore.getState().engine.exportSnapshot();
  const retry = [...host.querySelectorAll("button")].find(button => button.textContent === "Retry Forecast")!;
  act(() => retry.click());
  expect(useGameStore.getState().engine.exportSnapshot()).toEqual(snapshot);
  WorkerDouble.all.filter(item => item.message.kind === "forecast").at(-1)!.reply();
  expect(host.textContent).toContain("Forecast source 07:00:30");
  act(() => root.unmount());
});
