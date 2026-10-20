import { SimulationEngine } from "../core/SimulationEngine";
import type { LoggedAction, Scenario, SimulationAction, SimulationMetrics, SimulationRun, SimulationSnapshot } from "../types";
import { canonicalJSON, checksum, configurationIdentity, DT_MINUTES, ENGINE_VERSION, RUN_SCHEMA_VERSION } from "./Identity";

export interface CompletedRun extends SimulationRun {
  schemaVersion: 1;
  scenarioVersion: number;
  configurationIdentity: string;
  exportedAt: string;
  finalMetrics: SimulationMetrics;
  finalStateChecksum: string;
  actions: Array<LoggedAction & { affectedCount: number }>;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const fail = (message: string): never => { throw new Error(message); };
function keys(value: Record<string, unknown>, allowed: string[], context: string) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`Unsupported ${context} field.`);
}

export function validateAction(value: unknown, scenario: Scenario): asserts value is SimulationAction {
  if (!record(value) || typeof value.type !== "string") fail("Invalid action structure.");
  const action = value as Record<string, unknown>;
  const fields: Record<string, string[]> = {
    REROUTE: ["type", "targetEdge", "percentage", "avoidEdge"],
    DELAY_DEPARTURES: ["type", "targetEdge", "origin", "destination", "percentage", "durationMinutes"],
    RELEASE_DEPARTURES: ["type", "targetEdge", "origin", "destination"],
    DEBUG_SPAWN: ["type", "count"],
    DEBUG_INCIDENT: ["type", "edgeId", "capacityModifier", "durationMinutes"],
    DEBUG_CLEAR_INCIDENT: ["type", "edgeId"]
  };
  const allowed = fields[action.type as string];
  if (!allowed) fail(`Unsupported action type: ${action.type}. NO_OP ticks must be omitted.`);
  keys(action, allowed, "action");
  const edgeExists = (field: string, required = false) => {
    if (action[field] === undefined && !required) return;
    if (!scenario.graph.edges.some(edge => edge.id === action[field])) fail(`Unknown ${field} road.`);
  };
  edgeExists("targetEdge", action.type === "REROUTE");
  edgeExists("avoidEdge");
  edgeExists("edgeId", action.type === "DEBUG_INCIDENT" || action.type === "DEBUG_CLEAR_INCIDENT");
  for (const field of ["origin", "destination"]) {
    if (action[field] !== undefined && !scenario.graph.nodes.some(node => node.id === action[field])) fail(`Unknown ${field} node.`);
  }
  if (["REROUTE", "DELAY_DEPARTURES"].includes(action.type as string) && (!finite(action.percentage) || action.percentage < 0 || action.percentage > 1)) fail("Action percentage must be between 0 and 1.");
  if (["DELAY_DEPARTURES", "DEBUG_INCIDENT"].includes(action.type as string) && (!finite(action.durationMinutes) || action.durationMinutes < 0 || action.durationMinutes > 1440)) fail("Action duration must be between 0 and 1440 minutes.");
  if (action.type === "DEBUG_INCIDENT" && (!finite(action.capacityModifier) || action.capacityModifier <= 0 || action.capacityModifier > 1)) fail("Capacity modifier must be greater than 0 and at most 1.");
  if (action.type === "DEBUG_SPAWN" && (!Number.isInteger(action.count) || (action.count as number) < 0 || (action.count as number) > 10000)) fail("Spawn count must be an integer from 0 to 10000.");
}

// Logs timestamp the END of an interval; one action belongs to each engine step.
// Duplicates are rejected, never sorted, merged, or silently discarded.
export function validateActionTiming(actions: LoggedAction[], scenario: Scenario) {
  const duration = scenario.endTime - scenario.startTime;
  let previous = 0;
  for (const entry of actions) {
    const time = entry.simulationTime;
    if (!finite(time) || time < DT_MINUTES || time > duration || Math.abs(time / DT_MINUTES - Math.round(time / DT_MINUTES)) > 1e-8) fail("Action time must be an interval-end tick inside the scenario.");
    if (time <= previous) fail("Actions must be ordered, with one action per tick. Same-tick duplicates are unsupported; none were discarded.");
    validateAction(entry.action, scenario);
    previous = time;
  }
}

export function finalStateChecksum(snapshot: SimulationSnapshot): string {
  return checksum({ ...snapshot, scenario: { ...snapshot.scenario, seed: snapshot.seed } });
}

export function createCompletedRun(engine: SimulationEngine): CompletedRun {
  if (!engine.isDone()) fail("Finish the scenario before exporting or watching its replay.");
  const snapshot = engine.exportSnapshot();
  const run = engine.createRun();
  validateActionTiming(run.actions, snapshot.scenario);
  return {
    ...run,
    schemaVersion: RUN_SCHEMA_VERSION,
    scenarioVersion: snapshot.scenario.version ?? 1,
    configurationIdentity: configurationIdentity(snapshot.scenario),
    exportedAt: new Date().toISOString(),
    actions: run.actions.map(entry => ({ ...entry, affectedCount: entry.affectedCount ?? 0 })),
    finalMetrics: snapshot.metrics,
    finalStateChecksum: finalStateChecksum(snapshot)
  };
}

export function parseRunFile(text: string, scenario: Scenario): CompletedRun {
  if (text.length > 2_000_000) fail("Run file exceeds the 2 MB limit.");
  let input: unknown;
  try { input = JSON.parse(text); } catch { fail("Invalid JSON. Choose a Central Traffic run file."); }
  if (!record(input)) fail("Run file must be a JSON object.");
  const data = input as Record<string, unknown>;
  keys(data, ["schemaVersion", "scenarioId", "scenarioVersion", "engineVersion", "configurationIdentity", "seed", "startedAt", "exportedAt", "actions", "finalMetrics", "finalStateChecksum"], "run");
  if (data.schemaVersion !== RUN_SCHEMA_VERSION) fail("Unsupported run schema version. Older formats are not converted automatically.");
  if (data.engineVersion !== ENGINE_VERSION) fail("Incompatible engine version.");
  if (data.scenarioId !== scenario.id || data.scenarioVersion !== (scenario.version ?? 1)) fail("Incompatible scenario ID or version. Only this Monday Morning challenge is supported.");
  if (data.configurationIdentity !== configurationIdentity(scenario)) fail("Incompatible scenario configuration or objective weights.");
  if (!Number.isInteger(data.seed) || (data.seed as number) < 1 || (data.seed as number) > 0xffffffff) fail("Seed must be an integer from 1 to 4294967295.");
  for (const field of ["startedAt", "exportedAt"]) if (typeof data[field] !== "string" || !Number.isFinite(Date.parse(data[field] as string))) fail(`Invalid ${field} timestamp.`);
  if (typeof data.finalStateChecksum !== "string" || !/^[a-f0-9]{16}$/.test(data.finalStateChecksum)) fail("Missing or invalid final-state checksum.");
  const maxTicks = (scenario.endTime - scenario.startTime) / DT_MINUTES;
  if (!Array.isArray(data.actions) || data.actions.length > maxTicks) fail("Invalid action list or too many actions.");
  for (const item of data.actions as unknown[]) {
    if (!record(item)) fail("Invalid logged action.");
    const entry = item as Record<string, unknown>;
    keys(entry, ["simulationTime", "stateSnapshotId", "action", "immediateReward", "affectedCount"], "logged action");
    if (!finite(entry.immediateReward) || !Number.isInteger(entry.affectedCount) || (entry.affectedCount as number) < 0) fail("Invalid action reward or affected count.");
    if (!finite(entry.simulationTime) || entry.stateSnapshotId !== `t_${(entry.simulationTime as number).toFixed(2)}`) fail("Action timestamp and snapshot ID disagree.");
  }
  validateActionTiming(data.actions as LoggedAction[], scenario);
  const reference = new SimulationEngine(scenario).getState().metrics;
  if (!record(data.finalMetrics)) fail("Missing final metrics.");
  const metrics = data.finalMetrics as Record<string, unknown>;
  keys(metrics, [...Object.keys(reference), "worstBottleneck"], "metrics");
  for (const key of Object.keys(reference).filter(key => key !== "objectiveBreakdown")) {
    if (!finite(metrics[key]) || (metrics[key] as number) < 0) fail(`Invalid final metric: ${key}.`);
  }
  if ((metrics.averageSatisfaction as number) > 100 || (metrics.flow as number) > 100) fail("Satisfaction and flow must be between 0 and 100.");
  if (metrics.worstBottleneck !== undefined && typeof metrics.worstBottleneck !== "string") fail("Invalid bottleneck metric.");
  if (!record(metrics.objectiveBreakdown)) fail("Missing objective breakdown.");
  const components = metrics.objectiveBreakdown as Record<string, unknown>;
  const componentKeys = ["travelTime", "congestion", "departureDelay", "dissatisfaction", "excessDistance"];
  keys(components, componentKeys, "objective component");
  if (componentKeys.some(key => !finite(components[key]) || (components[key] as number) < 0)) fail("Invalid objective component.");
  const sum = componentKeys.reduce((total, key) => total + (components[key] as number), 0);
  if (Math.abs(sum - (metrics.objective as number)) > 1e-6) fail("Objective components do not sum to total system cost.");
  const counts = ["tripsRequested", "tripsCompleted", "activeTrips", "waitingTrips"];
  if (counts.some(key => !Number.isInteger(metrics[key]) || (metrics[key] as number) < 0) || metrics.tripsRequested !== (metrics.tripsCompleted as number) + (metrics.activeTrips as number) + (metrics.waitingTrips as number)) fail("Inconsistent final trip counts.");
  return JSON.parse(JSON.stringify(data)) as CompletedRun;
}

export function verifyCompletedRun(engine: SimulationEngine, run: CompletedRun): string | null {
  if (!engine.isDone()) return "Replay has not reached scenario end.";
  if (canonicalJSON(engine.getState().metrics) !== canonicalJSON(run.finalMetrics)) return "Replay verification failed: final metrics differ from the recorded run.";
  if (finalStateChecksum(engine.exportSnapshot()) !== run.finalStateChecksum) return "Replay verification failed: deterministic final simulation state differs.";
  return null;
}
