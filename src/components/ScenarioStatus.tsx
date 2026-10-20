import { useGameStore } from "../game/GameStore";
import { scenarioProgress } from "../game/ScenarioProgress";

export function ScenarioStatus() {
  const { engine, scenario, scenarioMode, replay, incidentNotice, dismissIncidentNotice, retrySameSeed } = useGameStore();
  if (scenarioMode !== "monday") return null;
  const progress = scenarioProgress(scenario, engine.getObservation(), engine.getInfo().activeEventIds);
  return <section className="roundStatus" aria-label="Round progression">
    <div><strong aria-live="polite">{replay ? "Replay · " : ""}{progress.stage}</strong>
      {replay && <><span>Recorded actions only. Pause and speed controls remain available.</span><button onClick={retrySameSeed}>Exit Replay · Try This Seed Again</button></>}
    </div>
    {progress.incidents.map(event => <p key={event.id}>
      {event.roadName}: scheduled capacity reduction {(100 * (1 - event.capacityModifier)).toFixed(0)}%; current capacity {(event.currentModifier * 100).toFixed(0)}%.
      {" "}Started {event.start}; {event.remaining.toFixed(2)} min scheduled remaining; restoration scheduled {event.restoration}.
    </p>)}
    {!progress.incidents.length && progress.restored.map(event => <p key={event.id}>
      {event.roadName}: restriction ended {event.restoration}; current capacity {(event.currentModifier * 100).toFixed(0)}%.
      {" "}{event.currentModifier === 1 ? "Capacity restored. Traffic may still be congested; inspect the map and forecasts." : "Another restriction remains; traffic may still be congested."}
    </p>)}
    {incidentNotice && <div className="incidentNotice"><span role="status">{incidentNotice}</span><button onClick={dismissIncidentNotice}>Dismiss incident notice</button></div>}
  </section>;
}
