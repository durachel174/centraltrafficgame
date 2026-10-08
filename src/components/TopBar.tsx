import { useGameStore } from "../game/GameStore";

const formatClock = (minutes: number) => {
  const hour = Math.floor(minutes / 60);
  const minute = Math.floor(minutes % 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export function TopBar() {
  const { engine } = useGameStore();
  const time = engine.getObservation().time;
  return (
    <header className="topBar">
      <div>
        <h1>Central Traffic</h1>
        <span>Monday Morning</span>
      </div>
      <strong>{formatClock(time)}</strong>
    </header>
  );
}
