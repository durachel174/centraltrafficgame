import { useGameStore } from "../game/GameStore";
import { baselineIdentity } from "../simulation/logging/Identity";
import { DecisionHistory } from "./DecisionHistory";
import { RunFiles } from "./RunFiles";

const componentLabels = {
  travelTime: ["Travel-time cost", "passenger-minutes"],
  congestion: ["Congestion cost", "utilization²-minutes"],
  departureDelay: ["Waiting-delay cost", "passenger-minutes"],
  dissatisfaction: ["Dissatisfaction cost", "satisfaction points"],
  excessDistance: ["Excess-distance cost", "km"]
} as const;

export function EndScreen() {
  const { engine, scenario, scenarioMode, seed, baseline, reset, setScenarioMode, startFreePractice, retrySameSeed, newSeed, startReplay, replay, completedRun, computeBaseline } = useGameStore();
  const metrics = engine.getState().metrics;
  const practice = scenarioMode === "practice";
  const compatible = baseline.status === "ready" && baseline.identity === baselineIdentity(scenario, seed) ? baseline.metrics : null;
  const improvement = compatible && compatible.objective > 0 ? ((compatible.objective - metrics.objective) / compatible.objective) * 100 : null;
  return (
    <div className="endOverlay">
      <section className="endScreen" aria-label="Scenario results">
        <h2>{scenario.name} Complete</h2>
        {replay && <p role="status">{replay.verification === "verified" ? "Replay verified: every final metric and deterministic simulation state match the recorded run." : replay.error ?? "Replay verification pending."}</p>}
        {practice && <p>Practice complete — an opportunity to experiment, with no competitive rating.</p>}
        <div className="endGrid">
          <span>Seed</span><strong>{seed}</strong>
          <span>Trips requested</span><strong>{metrics.tripsRequested}</strong>
          <span>Trips completed</span><strong>{metrics.tripsCompleted}</strong>
          <span>Waiting unfinished trips</span><strong>{metrics.waitingTrips}</strong>
          <span>Active unfinished trips</span><strong>{metrics.activeTrips}</strong>
          <span>Average completed travel</span><strong>{metrics.averageTravelTime.toFixed(1)} min</strong>
          <span>Median completed travel</span><strong>{metrics.medianTripTime.toFixed(1)} min</strong>
          <span>90th percentile completed travel</span><strong>{metrics.p90TripTime.toFixed(1)} min</strong>
          <span>95th percentile completed travel</span><strong>{metrics.p95TripTime.toFixed(1)} min</strong>
          <span>Maximum completed travel</span><strong>{metrics.maxTripTime.toFixed(1)} min</strong>
          <span>Passenger satisfaction</span><strong>{metrics.averageSatisfaction.toFixed(1)}%</strong>
          <span>Worst bottleneck</span><strong>{metrics.worstBottleneck || "None"}</strong>
          {!practice && <>
            <span>System cost (lower is better)</span><strong>{metrics.objective.toFixed(1)}</strong>
            <span>No-action baseline cost</span><strong>{compatible?.objective.toFixed(1) ?? (baseline.status === "loading" ? "Calculating in worker…" : "Unavailable")}</strong>
            <span>Improvement (higher is better)</span><strong>{improvement === null ? "Unavailable" : `${Math.abs(improvement) > 0 && Math.abs(improvement) < 0.001 ? improvement.toExponential(2) : improvement.toFixed(Math.abs(improvement) > 0 && Math.abs(improvement) < 0.1 ? 3 : 1)}%`}</strong>
          </>}
        </div>
        <p>Completion and travel-time statistics cover arrivals only, from dispatch to arrival. Satisfaction includes completed, active, and waiting riders. Active and waiting trips remain unfinished at scenario end.</p>
        {!practice && <>
          <p>Improvement = (baseline cost − your cost) ÷ baseline cost × 100%. Positive means lower cost than baseline; negative means higher cost. Unfinished trips still contribute elapsed travel, waiting, dissatisfaction, and planned excess distance.</p>
          <details className="costDetails"><summary>Objective components and baseline conditions</summary>
            <p>Weighted cost units, rounded for display. The unrounded components sum to total system cost.</p>
            <table><thead><tr><th>Component</th><th>Your cost</th><th>Baseline cost</th></tr></thead><tbody>
              {Object.entries(componentLabels).map(([key, [label, unit]]) => {
                const component = key as keyof typeof componentLabels;
                return <tr key={key}><th>{label}<small>{scenario.objectiveWeights[component]} × {unit}</small></th><td>{metrics.objectiveBreakdown?.[component].toFixed(1) ?? "Unavailable"}</td><td>{compatible?.objectiveBreakdown?.[component].toFixed(1) ?? "Unavailable"}</td></tr>;
              })}
              <tr><th>Total system cost</th><td>{metrics.objective.toFixed(1)}</td><td>{compatible?.objective.toFixed(1) ?? "Unavailable"}</td></tr>
            </tbody></table>
            <p>Comparison requires identical engine version, scenario ID/version, full configuration (including objective weights), seed {seed}, start, and end time. The baseline has no player intervention.</p>
          </details>
          {!compatible && baseline.status !== "loading" && <><p role="alert">{baseline.error ?? "No compatible baseline is available."}</p><button onClick={computeBaseline}>Retry Baseline</button></>}
          <DecisionHistory />
        </>}
        {practice ? <div className="previewActions">
          <button onClick={() => setScenarioMode("monday")}>Start Monday Morning</button>
          <button onClick={startFreePractice}>Practice Again</button>
        </div> : <>
          <div className="resultActions">
            <button onClick={retrySameSeed}>Try This Seed Again</button>
            <button onClick={newSeed}>New Seed</button>
            <button disabled={!completedRun} onClick={() => replay ? reset() : startReplay()}>{replay ? "Restart Replay" : "Watch Replay"}</button>
          </div>
          <RunFiles />
        </>}
      </section>
    </div>
  );
}
