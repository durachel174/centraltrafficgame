import { useGameStore } from "../game/GameStore";

export function EndScreen() {
  const { engine, scenario, scenarioMode, baselineObjective, reset, setScenarioMode, startFreePractice } = useGameStore();
  const metrics = engine.getState().metrics;
  const practice = scenarioMode === "practice";
  const improvement = baselineObjective !== null && baselineObjective > 0 ? ((baselineObjective - metrics.objective) / baselineObjective) * 100 : null;
  return (
    <div className="endOverlay">
      <section className="endScreen">
        <h2>{scenario.name} Complete</h2>
        {practice && <p>Practice complete — an opportunity to experiment, with no competitive rating.</p>}
        <div className="endGrid">
          <span>Trips requested</span><strong>{metrics.tripsRequested}</strong>
          <span>Trips completed</span><strong>{metrics.tripsCompleted}</strong>
          <span>Waiting unfinished trips</span><strong>{metrics.waitingTrips}</strong>
          <span>Active unfinished trips</span><strong>{metrics.activeTrips}</strong>
          <span>Average completed travel</span><strong>{metrics.averageTravelTime.toFixed(1)} min</strong>
          <span>Median completed travel</span><strong>{metrics.medianTripTime.toFixed(1)} min</strong>
          <span>95th percentile completed travel</span><strong>{metrics.p95TripTime.toFixed(1)} min</strong>
          <span>Passenger satisfaction</span><strong>{metrics.averageSatisfaction.toFixed(1)}%</strong>
          <span>Worst bottleneck</span><strong>{metrics.worstBottleneck ?? "None"}</strong>
          {!practice && <>
            <span>System cost (lower is better)</span><strong>{metrics.objective.toFixed(0)}</strong>
            <span>No-action baseline cost</span><strong>{baselineObjective?.toFixed(0) ?? "Unavailable"}</strong>
            <span>Improvement (higher is better)</span><strong>{improvement === null ? "Unavailable" : `${improvement.toFixed(1)}%`}</strong>
          </>}
        </div>
        <p>Completion and travel-time figures cover arrivals. Waiting and active trips remain unfinished.</p>
        {!practice && <p>The baseline uses the same scenario, seed, and end time without player intervention. System cost includes unfinished trips.</p>}
        {practice ? <div className="previewActions">
          <button onClick={() => setScenarioMode("monday")}>Start Monday Morning</button>
          <button onClick={startFreePractice}>Practice Again</button>
        </div> : <button onClick={() => { reset(); useGameStore.getState().setSpeed(1); }}>Run Again</button>}
      </section>
    </div>
  );
}
