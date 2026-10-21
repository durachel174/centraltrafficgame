import { formatClock } from "../game/ScenarioProgress";
import { Modal } from "./Modal";
import { useGameStore } from "../game/GameStore";
import { baselineIdentity } from "../simulation/logging/Identity";
import { DecisionHistory } from "./DecisionHistory";
import { RunFiles } from "./RunFiles";

const componentLabels = {
  travelTime: ["Travel-time cost", "passenger-minutes"],
  congestion: ["Congestion cost", "utilization²-minutes"],
  departureDelay: ["Waiting-delay cost", "passenger-minutes"],
  dissatisfaction: ["Dissatisfaction cost", "satisfaction points"],
  excessDistance: ["Excess-distance cost", "km"],
  terminalHoldDelay: ["Terminal hold estimate (excluded)", "passenger-minutes"]
} as const;

export function EndScreen() {
  const { engine, scenario, scenarioMode, seed, baseline, reset, setScenarioMode, startFreePractice, retrySameSeed, newSeed, startReplay, replay, completedRun, computeBaseline } = useGameStore();
  const metrics = engine.getState().metrics;
  const evaluation = engine.getEvaluation();
  const checkpoint = engine.getDecisionCutoffMetrics();
  const fullClearance = !!scenario.evaluation;
  const incomplete = evaluation.finishReason === "safety-limit";
  const practice = scenarioMode === "practice";
  const compatible = baseline.status === "ready" && baseline.identity === baselineIdentity(scenario, seed) ? baseline.metrics : null;
  const baselineComplete = fullClearance ? baseline.evaluation?.phase === "finished" && baseline.evaluation.finishReason === "all-arrived" && baseline.evaluation.decisionCutoff === scenario.endTime && baseline.evaluation.maxClearanceMinutes === scenario.evaluation!.maxClearanceMinutes : true;
  const showImprovement = !incomplete && (!compatible || baselineComplete);
  const comparable = !!compatible && !incomplete && baselineComplete;
  const improvement = comparable && compatible && compatible.objective > 0 ? ((compatible.objective - metrics.objective) / compatible.objective) * 100 : null;
  return (
    <Modal title={`${scenario.name}${incomplete ? " — Evaluation incomplete" : " Complete"}`} label="Scenario results" className="endScreen">
        {replay && <p role="status">{replay.verification === "verified" ? "Replay verified: every final metric and deterministic simulation state match the recorded run." : replay.error ?? "Replay verification pending."}</p>}
        {practice && <p>Practice complete — an opportunity to experiment, with no competitive rating.</p>}
        <div className="endGrid">
          <span>Seed</span><strong>{seed}</strong>
          {!practice && <><span>Your evaluation</span><strong>{incomplete ? "Evaluation incomplete — safety limit reached" : "All trips arrived"}</strong>
            <span>Cost at decision cutoff {formatClock(evaluation.decisionCutoff)} (accrued)</span><strong>{checkpoint ? (checkpoint.objective - (checkpoint.objectiveBreakdown?.terminalHoldDelay ?? 0)).toFixed(1) : "Unavailable"}</strong>
            <span>Clearance duration</span><strong>{evaluation.elapsedClearanceMinutes.toFixed(2)} min</strong>
          </>}
          <span>Trips requested</span><strong>{metrics.tripsRequested}</strong>
          <span>Trips completed</span><strong>{metrics.tripsCompleted}</strong>
          <span>Waiting unfinished trips</span><strong>{metrics.waitingTrips}</strong>
          <span>Active unfinished trips</span><strong>{metrics.activeTrips}</strong>
          <span>Of active trips: queued at road exits</span><strong>{metrics.inNetworkQueuedTrips}</strong>
          <span>Average completed travel</span><strong>{metrics.averageTravelTime.toFixed(1)} min</strong>
          <span>Median completed travel</span><strong>{metrics.medianTripTime.toFixed(1)} min</strong>
          <span>90th percentile completed travel</span><strong>{metrics.p90TripTime.toFixed(1)} min</strong>
          <span>95th percentile completed travel</span><strong>{metrics.p95TripTime.toFixed(1)} min</strong>
          <span>Maximum completed travel</span><strong>{metrics.maxTripTime.toFixed(1)} min</strong>
          <span>Passenger satisfaction</span><strong>{metrics.averageSatisfaction.toFixed(1)}%</strong>

          <span>Worst bottleneck</span><strong>{metrics.worstBottleneck || "None"}</strong>
          {!practice && <>
            <span>{incomplete ? "Accrued system cost through limit" : "Final realized system cost (lower is better)"}</span><strong>{metrics.objective.toFixed(1)}</strong>
            <span>Baseline evaluation</span><strong>{compatible ? (baseline.evaluation?.finishReason === "safety-limit" ? "Evaluation incomplete — safety limit reached" : baselineComplete ? "All trips arrived" : "Status unavailable") : "Unavailable"}</strong>
            <span>{baseline.evaluation?.finishReason === "safety-limit" ? "No-action baseline accrued cost through limit" : "No-action baseline cost"}</span><strong>{compatible?.objective.toFixed(1) ?? (baseline.status === "loading" ? "Calculating in worker…" : "Unavailable")}</strong>
            <span>{showImprovement ? "Improvement (higher is better)" : "Final cost comparison"}</span><strong>{!comparable ? (showImprovement ? "Unavailable" : "Not comparable until both evaluations complete") : improvement === null ? "Unavailable" : `${Math.abs(improvement) > 0 && Math.abs(improvement) < 0.001 ? improvement.toExponential(2) : improvement.toFixed(Math.abs(improvement) > 0 && Math.abs(improvement) < 0.1 ? 3 : 1)}%`}</strong>
          </>}
        </div>
        <p>Completion and travel-time statistics cover arrivals only, from dispatch to arrival. Satisfaction includes completed, active, and waiting riders. Waiting trips are at origins; queues at road exits are a subset of active trips. {incomplete || !fullClearance ? "Any active and waiting trips remain unfinished at evaluation end." : "All requested trips arrived by evaluation finish."}</p>
        {!practice && <>
          <p>{incomplete ? "Evaluation incomplete. Costs accrued through the safety limit are not full-journey costs. Unresolved trips remain accounted for; no deadlock or successful clearance is claimed." : "Final realized costs include actual waiting and travel after decisions close. Improvement = (baseline cost − your cost) ÷ baseline cost × 100%. Positive means lower cost; negative means higher cost. Compare only matching complete evaluations."}</p>
          {compatible && !baselineComplete && <p>The baseline is incomplete. Its accrued cost and status are shown separately; no final improvement percentage is awarded.</p>}
          <details className="costDetails"><summary>Objective components and baseline conditions</summary>
            <p>Weighted cost units, rounded for display. The unrounded components sum to total system cost. Actual waiting is charged once; the historical cutoff hold estimate is not added to realized evaluation cost.</p>
            {checkpoint && <p>Historical checkpoint only: {(checkpoint.remainingHoldPassengerMinutes ?? 0).toFixed(1)} passenger-minutes of remaining imposed hold; estimated weighted liability {(checkpoint.objectiveBreakdown?.terminalHoldDelay ?? 0).toFixed(1)} cost units. Excluded from final realized cost.</p>}
            <table><thead><tr><th>Component</th><th>Your cost</th><th>Baseline cost</th></tr></thead><tbody>
              {Object.entries(componentLabels).map(([key, [label, unit]]) => {
                const component = key as keyof typeof componentLabels;
                return <tr key={key}><th>{label}<small>{scenario.objectiveWeights[component === "terminalHoldDelay" ? "departureDelay" : component]} × {unit}</small></th><td>{metrics.objectiveBreakdown?.[component].toFixed(1) ?? "Unavailable"}</td><td>{compatible?.objectiveBreakdown?.[component].toFixed(1) ?? "Unavailable"}</td></tr>;
              })}
              <tr><th>Total system cost</th><td>{metrics.objective.toFixed(1)}</td><td>{compatible?.objective.toFixed(1) ?? "Unavailable"}</td></tr>
            </tbody></table>
            <p>Comparison requires identical engine version, scenario ID/version, full configuration (including objective weights), seed {seed}, decision cutoff and clearance safety limit. Actual finish times may differ. The baseline has no player intervention.</p>
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
    </Modal>
  );
}
