import { ENGINE_VERSION } from "../src/simulation/logging/Identity";
import { BaselineController } from "../src/simulation/controllers/BaselineController";
import { ReactiveController } from "../src/simulation/controllers/ReactiveController";
import type { TrafficController } from "../src/simulation/controllers/TrafficController";
import { TrafficEnvironment } from "../src/simulation/environment/TrafficEnvironment";
import { mondayMorningScenario } from "../src/simulation/scenarios/MondayMorning";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  })
);

const runs = Number(args.runs ?? 1);
const controllerName = String(args.controller ?? "baseline");
const seed = Number(args.seed ?? mondayMorningScenario.seed ?? 428193);

const makeController = (): TrafficController =>
  controllerName === "reactive" ? new ReactiveController() : new BaselineController();

const objectives: number[] = [];
const travel: number[] = [];
const trips: number[] = [];
const completed: number[] = [], active: number[] = [], waiting: number[] = [], cutoffCosts: number[] = [], clearance: number[] = [];
let completeRuns = 0;

for (let i = 0; i < runs; i++) {
  const env = new TrafficEnvironment(mondayMorningScenario);
  let observation = env.reset(seed + i);
  const controller = makeController();
  let done = false;
  while (!done) {
    const action = (observation.evaluation.phase === "decision" ? controller.decide(observation) : null) ?? { type: "NO_OP" as const };
    const result = env.step(action);
    observation = result.observation;
    done = result.done;
  }
  const evaluation = env.getEngine().getEvaluation();
  if (evaluation.finishReason === "all-arrived") completeRuns++;
  const checkpoint = env.getEngine().getDecisionCutoffMetrics()!;
  cutoffCosts.push(checkpoint.objective - (checkpoint.objectiveBreakdown?.terminalHoldDelay ?? 0)); clearance.push(evaluation.elapsedClearanceMinutes);
  objectives.push(observation.metrics.objective);
  travel.push(observation.metrics.averageTravelTime);
  trips.push(observation.metrics.tripsRequested);
  completed.push(observation.metrics.tripsCompleted); active.push(observation.metrics.activeTrips); waiting.push(observation.metrics.waitingTrips);
}

const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

console.log(`Scenario: ${mondayMorningScenario.name}`);
console.log(`Engine: ${ENGINE_VERSION}; scenario version: ${mondayMorningScenario.version}; evaluation: post-demand clearance`);
console.log(`Seed: ${seed}`);
console.log(`Controller: ${controllerName}`);
console.log(`Runs: ${runs}`);
console.log(`Trips: ${Math.round(avg(trips))}`);
console.log(`Mean trips completed: ${avg(completed).toFixed(1)}; active unfinished: ${avg(active).toFixed(1)}; origin waiting unfinished: ${avg(waiting).toFixed(1)}`);
console.log(`Average completed travel: ${avg(travel).toFixed(1)} min`);
console.log(`Objective: ${avg(objectives).toFixed(0)}`);

console.log(`Cutoff accrued cost: ${avg(cutoffCosts).toFixed(2)}; final accrued cost: ${avg(objectives).toFixed(2)}; completed evaluations: ${completeRuns}/${runs}; mean clearance: ${avg(clearance).toFixed(2)} min`);
