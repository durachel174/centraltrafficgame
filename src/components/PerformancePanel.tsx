import { useEffect, useRef, useState } from "react";
import { browserPerformance } from "../performance/Recorder";
import { useGameStore } from "../game/GameStore";

export function PerformancePanel() {
  const [label, setLabel] = useState("normal-1x");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState("");
  const context = useRef<unknown>(null);
  const { engine, scenario, seed, speed, setSpeed, setScenarioMode, step } = useGameStore();
  useEffect(() => {
    if (typeof requestAnimationFrame !== "function") return;
    let previous = 0, frame = 0;
    const tick = (now: number) => { if (previous && previous >= browserPerformance.started) browserPerformance.record("frameInterval", now - previous); previous = now; frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    let observer: PerformanceObserver | null = null;
    if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      observer = new PerformanceObserver(list => list.getEntries().filter(entry => entry.startTime >= browserPerformance.started).forEach(entry => browserPerformance.record("longTask", entry.duration)));
      observer.observe({ entryTypes: ["longtask"] });
    }
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); browserPerformance.recording = false; };
  }, []);
  const sessionContext = () => ({ scenario: useGameStore.getState().scenario.id, seed: useGameStore.getState().seed,
    speed: useGameStore.getState().speed, time: useGameStore.getState().engine.getObservation().time,
    activeVehicles: useGameStore.getState().engine.getObservation().activeTrips, visibility: document.visibilityState });
  const finish = () => {
    browserPerformance.recording = false;
    const result = browserPerformance.report(performance.now());
    const frame = result.metrics.frameInterval;
    setReport(JSON.stringify({ ...result, approximateRAFfps: frame?.median ? 1000 / frame.median : null,
      notes: "rAF cadence, not unique Canvas updates or simulation throughput. Durations in milliseconds. Distributions use bounded retained samples.",
      browser: navigator.userAgent, viewport: [innerWidth, innerHeight], hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      longTaskSupported: typeof PerformanceObserver !== "undefined" && (PerformanceObserver.supportedEntryTypes?.includes("longtask") ?? false), start: context.current, end: sessionContext() }, null, 2));
    setRunning(false);
  };
  useEffect(() => { if (!running) return; const timer = window.setTimeout(finish, 20000); return () => clearTimeout(timer); }, [running]);
  const prepare = () => {
    browserPerformance.recording = false; setRunning(false); setReport("");
    setScenarioMode("monday", 428193);
    const target = (label.startsWith("rush") || label === "preview-map") ? 60 : label.startsWith("incident") ? 73 : 0;
    while (useGameStore.getState().engine.getState().time < target) step();
    if (label.startsWith("5000")) step({ type: "DEBUG_SPAWN", count: 5000 });
    setSpeed(label.endsWith("1x") ? 1 : 4);
  };
  return <details className="panel performancePanel"><summary>Local performance capture (development only)</summary>
    <p>20-second bounded capture. No telemetry. Prepare resets this development run; start capture after preparation. Preview can be requested while capturing.</p>
    <select aria-label="Measurement workload" value={label} onChange={event => setLabel(event.target.value)}>
      {["normal-1x", "normal-4x", "rush-4x", "incident-4x", "5000-4x", "preview-map"].map(value => <option key={value}>{value}</option>)}
    </select>
    <button onClick={prepare}>Prepare measurement workload</button>
    <button disabled={running} onClick={() => { context.current = sessionContext(); browserPerformance.start(label, performance.now()); setRunning(true); }}>Capture 20 seconds</button>
    {running && <button onClick={finish}>Finish capture now</button>}
    <p role="status">{running ? "Recording local timings…" : "Capture idle"} · seed {seed} · speed {speed} · {scenario.name} · {engine.getObservation().activeTrips} active</p>
    {report && <textarea aria-label="Performance report JSON" value={report} readOnly rows={12} style={{ width: "100%" }} />}
  </details>;
}
