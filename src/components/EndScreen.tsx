import { useGameStore } from "../game/GameStore";

export function EndScreen() {
  const { engine, baselineObjective, reset } = useGameStore();
  const metrics = engine.getState().metrics;
  const improvement = baselineObjective ? ((baselineObjective - metrics.objective) / baselineObjective) * 100 : 0;
  const rating = improvement > 20 ? "A" : improvement > 10 ? "B" : improvement > 0 ? "C" : "D";
  return (
    <div className="endOverlay">
      <section className="endScreen">
        <h2>Monday Morning Complete</h2>
        <div className="endGrid">
          <span>Trips requested</span>
          <strong>{metrics.tripsRequested}</strong>
          <span>Trips completed</span>
          <strong>{metrics.tripsCompleted}</strong>
          <span>Average travel</span>
          <strong>{metrics.averageTravelTime.toFixed(1)} min</strong>
          <span>Median</span>
          <strong>{metrics.medianTripTime.toFixed(1)} min</strong>
          <span>95th percentile</span>
          <strong>{metrics.p95TripTime.toFixed(1)} min</strong>
          <span>Worst bottleneck</span>
          <strong>{metrics.worstBottleneck}</strong>
          <span>System cost</span>
          <strong>{metrics.objective.toFixed(0)}</strong>
          <span>Baseline</span>
          <strong>{baselineObjective?.toFixed(0) ?? "..."}</strong>
          <span>Improvement</span>
          <strong>{improvement.toFixed(1)}%</strong>
          <span>Rating</span>
          <strong>{rating}</strong>
        </div>
        <p>Best decision: earliest congestion-reducing intervention. Worst decision: highest immediate objective penalty.</p>
        <button onClick={reset}>Run Again</button>
      </section>
    </div>
  );
}
