import { SimulationEngine } from "../core/SimulationEngine";

/** Independent experimental continuation. Never installs results into the game,
 * baseline or official run. Call only NO_OP steps on the returned diagnostic. */
export function clearanceDiagnostic(source: SimulationEngine, capMinutes: number) {
  if (!source.isDone()) throw Error("Finish the decision window before clearance diagnostics.");
  if (!Number.isFinite(capMinutes) || capMinutes <= 0 || capMinutes % source.dtMinutes) throw Error("Clearance safety limit must be positive and tick-aligned.");
  const snapshot = source.exportSnapshot();
  snapshot.scenario.endTime += capMinutes;
  snapshot.scenario.terminalHoldAccounting = false;
  snapshot.scenario.demand.curve = [{ minute: 0, tripsPerMinute: 0 }, { minute: snapshot.time + capMinutes + 1, tripsPerMinute: 0 }];
  snapshot.forecastingEnabled = false;
  const engine = new SimulationEngine(snapshot.scenario, undefined, true);
  engine.restoreFromSnapshot(snapshot);
  return engine;
}
