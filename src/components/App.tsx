import { useEffect } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useGameStore } from "../game/GameStore";
import { TopBar } from "./TopBar";
import { MetricsBar } from "./MetricsBar";
import { TrafficMap } from "./TrafficMap";
import { AlertPanel } from "./AlertPanel";
import { RoadInspector } from "./RoadInspector";
import { DebugPanel } from "./DebugPanel";
import { EndScreen } from "./EndScreen";

export function App() {
  const { engine, speed, setSpeed, step, reset, computeBaseline, version } = useGameStore();
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
      <MetricsBar />
      <main className="mainGrid">
        <section className="mapPanel">
          <div className="mapToolbar">
            <button className={speed === 0 ? "active" : ""} onClick={() => setSpeed(0)} title="Pause">
              <Pause size={17} />
            </button>
            {[1, 2, 4].map((value) => (
              <button key={value} className={speed === value ? "active" : ""} onClick={() => setSpeed(value as 1 | 2 | 4)}>
                <Play size={15} /> {value}x
              </button>
            ))}
            <button onClick={reset} title="Reset">
              <RotateCcw size={16} />
            </button>
          </div>
          <TrafficMap />
        </section>
        <aside className="sidePanel">
          <RoadInspector />
          <AlertPanel />
          <DebugPanel />
        </aside>
      </main>
      {done && <EndScreen />}
    </div>
  );
}
