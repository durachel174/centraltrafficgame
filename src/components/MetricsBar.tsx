import { useGameStore } from "../game/GameStore";

export function MetricsBar({ detailed = false }: { detailed?: boolean }) {
  const { engine, baselineObjective } = useGameStore();
  const metrics = engine.getState().metrics;
  const improvement = baselineObjective ? ((baselineObjective - metrics.objective) / baselineObjective) * 100 : 0;
  const pressure = Math.max(0, 100 - metrics.flow);
  if (detailed) {
    return (
      <section className="metricsBar detailMetrics">
        <div><span>Trips requested</span><strong>{metrics.tripsRequested}</strong></div>
        <div><span>Average trip</span><strong>{metrics.averageTravelTime.toFixed(1)} min</strong></div>
        <div><span>System cost</span><strong>{metrics.objective.toFixed(0)}</strong></div>
        <div><span>Baseline change</span><strong>{improvement.toFixed(1)}%</strong></div>
        <div><span>Worst bottleneck</span><strong>{metrics.worstBottleneck ?? "None"}</strong></div>
      </section>
    );
  }
  return (
    <section className="metricsBar">
      <div>
        <span>Trips completed</span>
        <strong>{metrics.tripsCompleted}</strong>
      </div>
      <div>
        <span>Passenger satisfaction</span>
        <strong>{metrics.averageSatisfaction.toFixed(0)}%</strong>
      </div>
      <div>
        <span>Network pressure</span>
        <strong>{pressure.toFixed(0)}%</strong>
      </div>
    </section>
  );
}
