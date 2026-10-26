import { useGameStore } from "../game/GameStore";

const formatClock = (minutes: number) => {
  const hour = Math.floor(minutes / 60);
  const minute = Math.floor(minutes % 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export function TopBar() {
  const { engine, scenario, scenarioMode, setScenarioMode, startFreePractice, seed } = useGameStore();
  const time = engine.getObservation().time;
  return (
    <header className="topBar">
      <div>
        <h1>Central Traffic</h1>
        <span>{scenario.name}</span>
        <details className="seedDetails"><summary>Seed {seed}</summary><span>Demand, baseline, export, and replay use this seed.</span></details>
      </div>
      <div className="scenarioSwitch" aria-label="Scenario">
        <button className={scenarioMode === "practice" ? "active" : ""} onClick={startFreePractice}>Practice</button>
        <button className={scenarioMode === "monday" ? "active" : ""} onClick={() => setScenarioMode("monday")}>Monday Morning</button>
        <button onClick={() => setScenarioMode("twoBridges")}>Two Bridges · Experimental</button>
      </div>
      <strong>{formatClock(time)}</strong>
    </header>
  );
}
