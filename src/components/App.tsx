import { useEffect } from "react";
import { ChevronDown, Gauge, HelpCircle, Pause, Play, RotateCcw, Wrench } from "lucide-react";
import { useGameStore } from "../game/GameStore";
import { TopBar } from "./TopBar";
import { MetricsBar } from "./MetricsBar";
import { TrafficMap } from "./TrafficMap";
import { AlertPanel } from "./AlertPanel";
import { RoadInspector } from "./RoadInspector";
import { DebugPanel } from "./DebugPanel";
import { EndScreen } from "./EndScreen";
import { TutorialCoach } from "./TutorialCoach";

export function App() {
  const { engine, speed, setSpeed, step, reset, computeBaseline, version, devToolsOpen, toggleDevTools, replayTutorial } = useGameStore();
  const done = engine.isDone();

  useEffect(() => {
    computeBaseline();
  }, [computeBaseline]);

  useEffect(() => {
    if (!speed || done) return;
    const interval = window.setInterval(() => {
      for (let i = 0; i < speed; i++) step();
    }, 90);
    return () => window.clearInterval(interval);
  }, [speed, step, done, version]);

  return (
    <div className="appShell">
      <TopBar />
      <div className="commandStrip">
        <div className="transportControls" aria-label="Simulation controls">
          <button className={speed === 0 ? "active" : ""} onClick={() => setSpeed(0)} title="Pause">
            <Pause size={17} /> Pause
          </button>
          {[1, 2, 4].map((value) => (
            <button key={value} className={speed === value ? "active" : ""} onClick={() => setSpeed(value as 1 | 2 | 4)}>
              <Play size={15} /> {value}x
            </button>
          ))}
          <button onClick={reset} title="Reset">
            <RotateCcw size={16} /> Reset
          </button>
        </div>
        <div className="utilityControls">
          <button onClick={replayTutorial}>
            <HelpCircle size={16} /> Help
          </button>
          <button onClick={toggleDevTools} className={devToolsOpen ? "active" : ""}>
            <Wrench size={16} /> Dev
          </button>
        </div>
      </div>
      <MetricsBar />
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
          <details className="panel detailPanel">
            <summary>
              <Gauge size={16} /> Detailed stats <ChevronDown size={15} />
            </summary>
            <MetricsBar detailed />
          </details>
          {devToolsOpen && <DebugPanel />}
        </aside>
      </main>
      <TutorialCoach />
      {done && <EndScreen />}
    </div>
  );
}
