import { useLayoutEffect, useRef } from "react";
import { useGameStore } from "../game/GameStore";
import { formatClock } from "../game/ScenarioProgress";

export function ClearanceControls() {
  const { engine, fastForwarding, fastForwardToResults, watchClearance, help } = useGameStore();
  const evaluation = engine.getEvaluation(), region = useRef<HTMLElement>(null), cancel = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (evaluation.phase === "clearance" && !help.open) {
      if (fastForwarding) cancel.current?.focus();
      else region.current?.focus();
    }
  }, [evaluation.phase, fastForwarding]);
  if (evaluation.phase !== "clearance") return null;
  const metrics = engine.getObservation().metrics;
  return <section ref={region} tabIndex={-1} aria-label="Clearance controls" className="panel">
    <p role="status">Decisions complete. No new trips are entering demand. Existing trips are finishing, and their remaining costs still count.</p>
    <p>Waiting trips can still enter roads. Interventions are locked. Clearance: {evaluation.elapsedClearanceMinutes.toFixed(2)} / {evaluation.maxClearanceMinutes} min; evaluation limit {formatClock(evaluation.evaluationLimit)}.</p>
    <p>{metrics.tripsCompleted} completed · {metrics.activeTrips} active ({metrics.inNetworkQueuedTrips} queued at road exits) · {metrics.waitingTrips} waiting at origins.</p>
    {fastForwarding ? <><p>Fast-forwarding the live simulation in bounded batches.</p><button ref={cancel} onClick={watchClearance}>Cancel Fast-forward · Watch Clearance</button></>
      : <><button onClick={watchClearance}>Watch Clearance</button><button onClick={fastForwardToResults}>Fast-forward to Results</button></>}
  </section>;
}
