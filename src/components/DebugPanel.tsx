import { Bug, ChevronsRight, Cone } from "lucide-react";
import { useGameStore } from "../game/GameStore";

export function DebugPanel() {
  const { step } = useGameStore();
  return (
    <section className="panel debugPanel">
      <h2>Debug</h2>
      <button onClick={() => step({ type: "DEBUG_SPAWN", count: 100 })}>
        <Bug size={15} /> Spawn 100
      </button>
      <button onClick={() => step({ type: "DEBUG_SPAWN", count: 500 })}>
        <ChevronsRight size={15} /> Spawn 500
      </button>
      <button onClick={() => step({ type: "DEBUG_INCIDENT", edgeId: "north_bridge", capacityModifier: 0.6, durationMinutes: 15 })}>
        <Cone size={15} /> Trigger Incident
      </button>
      <button onClick={() => step({ type: "DEBUG_CLEAR_INCIDENT", edgeId: "north_bridge" })}>Clear Incident</button>
    </section>
  );
}
