import { PerformancePanel } from "./PerformancePanel";
import { useEffect } from "react";
import { ChevronDown, Gauge, HelpCircle, Pause, Play, RotateCcw, Wrench } from "lucide-react";
import { useGameStore } from "../game/GameStore";
import { ScenarioStatus } from "./ScenarioStatus";
import { DecisionHistory } from "./DecisionHistory";
import { RunFiles } from "./RunFiles";
import { TopBar } from "./TopBar";
import { MetricsBar } from "./MetricsBar";
import { TrafficMap } from "./TrafficMap";
import { AlertPanel } from "./AlertPanel";
import { RoadInspector } from "./RoadInspector";
import { DebugPanel } from "./DebugPanel";
import { EndScreen } from "./EndScreen";
import { TutorialCoach } from "./TutorialCoach";
import { HelpPanel } from "./HelpPanel";

export const canUseDevTools = (env: { DEV?: boolean } = import.meta.env) => env.DEV === true;

export function App() {
  const { engine, speed, setSpeed, step, reset, computeBaseline, version, devToolsOpen, toggleDevTools, openHelp, tutorial, replay, refreshForecasts } = useGameStore();
  const done = engine.isDone();
  const tutorialActive = tutorial.active;
  const revealPlayback = !tutorialActive || tutorial.step === "observe" || tutorial.step === "hold" || tutorial.step === "complete";
  const revealAdvanced = !tutorialActive || tutorial.step === "hold" || tutorial.step === "complete";
  const devAvailable = canUseDevTools();

  useEffect(() => {
    computeBaseline();
    refreshForecasts();
  }, [computeBaseline, refreshForecasts]);

  useEffect(() => {
    if (!speed || done) return;
    const interval = window.setInterval(() => {
      for (let i = 0; i < speed; i++) {
        // A phase transition or tutorial observation may pause inside this group.
        if (useGameStore.getState().speed === 0) break;
        step();
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [speed, step, done, version]);

  return (
    <div className={`appShell tutorialStep-${tutorial.active ? tutorial.step : "off"}`}>
      <TopBar />
      <div className="commandStrip">
        <div className="transportControls" aria-label="Simulation controls">
          <button className={speed === 0 ? "active" : ""} onClick={() => setSpeed(0)} title="Pause">
            <Pause size={17} /> Pause
          </button>
          {revealPlayback &&
            [1, 2, 4].map((value) => (
              <button key={value} className={speed === value ? "active" : ""} onClick={() => setSpeed(value as 1 | 2 | 4)}>
                <Play size={15} /> {value}x
              </button>
            ))}
          <button onClick={reset} title={replay ? "Restart Replay" : "Reset"}>
            <RotateCcw size={16} /> {replay ? "Restart Replay" : "Reset"}
          </button>
        </div>
        <div className="utilityControls">
          <button onClick={openHelp} data-focus-fallback>
            <HelpCircle size={16} /> Help
          </button>
          {devAvailable && !tutorialActive && !replay && (
            <button onClick={toggleDevTools} className={devToolsOpen ? "active" : ""}>
              <Wrench size={16} /> Dev
            </button>
          )}
        </div>
      </div>
      <MetricsBar />
      <ScenarioStatus />
      <main className="mainGrid">
        <section className="mapPanel">
          <div className="mapLegend" aria-label="Traffic legend">
            <span><i className="severityIcon calm" /> Steady</span>
            <span><i className="severityIcon busy" /> Building</span>
            <span><i className="severityIcon jammed" /> Heavy</span>
          </div>
          <TrafficMap />
        </section>
        <aside className="sidePanel">
          <RoadInspector />
          <AlertPanel />
          {!tutorialActive && <><DecisionHistory />{!done && <details className="panel"><summary>Run files</summary><RunFiles /></details>}</>}
          {revealAdvanced && (
            <details className="panel detailPanel">
              <summary>
                <Gauge size={16} /> Detailed stats <ChevronDown size={15} />
              </summary>
              <MetricsBar detailed />
            </details>
          )}
          {devAvailable && !tutorialActive && !replay && devToolsOpen && <DebugPanel />}
          {devAvailable && !tutorialActive && <PerformancePanel />}
        </aside>
      </main>
      <TutorialCoach />
      <HelpPanel />
      {done && <EndScreen />}
    </div>
  );
}
