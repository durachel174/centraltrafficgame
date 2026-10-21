import { useGameStore } from "../game/GameStore";
import { forecastMaxAge, visibleForecasts } from "../game/ForecastScheduler";
import { formatClock } from "../game/ScenarioProgress";
export function useForecastDisplay() {
  const { engine, scenario, forecastView } = useGameStore();
  const time = engine.getObservation().time - scenario.startTime;
  const maxAge = forecastMaxAge(scenario.forecast?.refreshIntervalMinutes ?? 1, scenario.forecast?.horizonsMinutes ?? [5, 10, 15]);
  return { forecasts: engine.externalForecasts ? visibleForecasts(forecastView, time, maxAge) : engine.getState().forecasts,
    sourceTime: forecastView.sourceTime, age: forecastView.sourceTime === null ? null : time - forecastView.sourceTime, maxAge };
}
export function ForecastSource() {
  const { engine, scenario, forecastView, refreshForecasts, fastForwarding } = useGameStore();
  const { sourceTime, age, maxAge } = useForecastDisplay();
  if (!engine.externalForecasts) return null;
  if (fastForwarding) return <p className="forecastSource">Forecasts refresh when you return to watching.</p>;
  return <div className="forecastSource" style={{ fontSize: 12, color: "#b8c9c1" }}>
    {engine.isDone() ? "Scenario complete; no new forecasts." : sourceTime !== null && age !== null && age <= maxAge ?
      <>Forecast source {formatClock(scenario.startTime + sourceTime)}:{String(Math.round((sourceTime % 1) * 60)).padStart(2, "0")} · {age.toFixed(2)} min old. Horizons count from now.</> :
      forecastView.status === "error" ? `Forecast unavailable: ${forecastView.error}` : "Forecast updating; no fresh projection available."}
    {forecastView.status === "error" && <><span className="srOnly" role="alert">Forecast unavailable: {forecastView.error}. Retry Forecast is available.</span><button onClick={() => refreshForecasts(true)}>Retry Forecast</button></>}
  </div>;
}
