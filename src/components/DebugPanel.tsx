import { Bug, ChevronsRight, Cone } from "lucide-react";
import { useGameStore } from "../game/GameStore";

export function DebugPanel() {
  const { step, engine } = useGameStore();
  const locked = !engine.decisionsOpen();
  return (
    <section className="panel debugPanel">
      <h2>Debug</h2>
      {locked && <p>Decisions are closed; debug interventions are locked.</p>}
      <button disabled={locked} onClick={() => step({ type: "DEBUG_SPAWN", count: 100 })}>
        <Bug size={15} /> Spawn 100
      </button>
      <button disabled={locked} onClick={() => step({ type: "DEBUG_SPAWN", count: 500 })}>
        <ChevronsRight size={15} /> Spawn 500
      </button>
      <button disabled={locked} onClick={() => step({ type: "DEBUG_INCIDENT", edgeId: "north_bridge", capacityModifier: 0.6, durationMinutes: 15 })}>
        <Cone size={15} /> Trigger Incident
      </button>
      <button disabled={locked} onClick={() => step({ type: "DEBUG_CLEAR_INCIDENT", edgeId: "north_bridge" })}>Clear Incident</button>
    </section>
  );
}
