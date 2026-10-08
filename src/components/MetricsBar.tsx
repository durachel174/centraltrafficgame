import { useGameStore } from "../game/GameStore";

export function MetricsBar() {
  const { engine, baselineObjective } = useGameStore();
  const metrics = engine.getState().metrics;
  const improvement = baselineObjective ? ((baselineObjective - metrics.objective) / baselineObjective) * 100 : 0;
  return (
    <section className="metricsBar">
      <div>
        <span>Flow</span>
        <strong>{metrics.flow.toFixed(0)}%</strong>
      </div>
      <div>
        <span>Avg Trip</span>
        <strong>{metrics.averageTravelTime.toFixed(1)} min</strong>
      </div>
      <div>
        <span>Satisfaction</span>
        <strong>{metrics.averageSatisfaction.toFixed(0)}%</strong>
      </div>
      <div>
        <span>Objective</span>
        <strong>{metrics.objective.toFixed(0)}</strong>
      </div>
      <div>
        <span>Improvement</span>
        <strong>{improvement.toFixed(1)}%</strong>
      </div>
    </section>
  );
}
