import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { twoBridgesScenario } from "../simulation/scenarios/TwoBridges";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import { createCompletedRun, parseRunFile, verifyCompletedRun, finalStateChecksum } from "../simulation/logging/RunFile";
import { actionForReplayTick, replayRun } from "../simulation/logging/Replay";
import { engineVersionFor } from "../simulation/logging/Identity";
import { App } from "../components/App";
import { crossingGoal, groupEligibility, trafficPresentation, trafficTransitions } from "../components/TwoBridgesFeedback";
import { readFileSync } from "node:fs";
import { TwoBridgesChallenge, challengeOutcome } from "../components/TwoBridgesChallenge";
import { useGameStore } from "../game/GameStore";
import type { Scenario, SimulationAction } from "../simulation/types";
function fixture(): Scenario {
    const s = structuredClone(twoBridgesScenario);
    s.endTime = s.startTime + 8;
    s.evaluation = { maxClearanceMinutes: 20 };
    s.departureGroups!.arrivalDeadline = s.startTime + 12;
    s.departureGroups!.arrivalTarget = 8;
    s.demand.batches = s.demand.batches!.slice(0, 2).map((b, i) => ({ ...b, at: i * 4, size: 5, decisionMinutes: 3 }));
    s.graph.edges = s.graph.edges.map(e => ({ ...e, lengthKm: e.id === "south_bridge" ? .5 : .25 }));
    s.events = [{ ...s.events[0], time: 1, duration: 2 }];
    return s;
}
function make(s = fixture()) { const e = new SimulationEngine(s, undefined, true); e.reset(428193); return e; }
function finish(e: SimulationEngine) { while (!e.isDone())
    e.step(); return e; }
function replayFile(e: SimulationEngine, s: Scenario) { const file = parseRunFile(JSON.stringify(createCompletedRun(e)), s), r = make(s); while (!r.isDone())
    r.step(actionForReplayTick(file, r.getState().time + .25)); expect(verifyCompletedRun(r, file)).toBeNull(); expect(finalStateChecksum(r.exportSnapshot())).toBe(file.finalStateChecksum); return file; }
describe("configured departure groups", () => {
    it("generates actual requests at interval end exactly once and conserves every passenger", () => {
        const s = fixture(), e = make(s);
        e.step();
        expect(e.getState().waiting).toHaveLength(5);
        expect(new Set(e.getState().waiting.map(t => t.groupId))).toEqual(new Set(["group_1"]));
        expect(e.getState().waiting.every(t => t.requestedDepartureTime === .25)).toBe(true);
        while (!e.isDone()) {
            e.step();
            const m = e.getObservation().metrics;
            expect(m.tripsRequested).toBe(m.tripsCompleted + m.activeTrips + m.waitingTrips);
        }
        expect(e.getObservation().metrics).toMatchObject({ tripsRequested: 10, tripsCompleted: 10, waitingTrips: 0, activeTrips: 0 });
    });
    it("routes only the selected pending group once and leaves future/unrelated requests untouched", () => {
        const e = make();
        e.step();
        const action: SimulationAction = { type: "ROUTE_GROUP", groupId: "group_1", corridorId: "south" };
        expect(e.step(action).info.actionRejected).toBeUndefined();
        const first = e.getState().vehicles;
        expect(first).toHaveLength(5);
        expect(first.every(v => v.groupId === "group_1" && v.route.includes("south_bridge") && !v.route.includes("north_bridge"))).toBe(true);
        const snapshot = e.exportSnapshot();
        expect(e.step(action).info.actionRejected).toContain("no pending");
        expect(e.exportSnapshot()).toEqual(snapshot);
        while (e.getState().time < 4.25)
            e.step();
        expect(e.getState().waiting.filter(t => t.groupId === "group_2")).toHaveLength(5);
        expect(e.getState().waiting.every(t => !t.assignedCorridor)).toBe(true);
    });
    it("holds only its group, then uses automatic routing without adding future demand controls", () => {
        const e = make();
        e.step();
        e.step({ type: "HOLD_GROUP", groupId: "group_1", durationMinutes: 6 });
        while (e.getState().time < 4.25)
            e.step();
        const s = e.getState();
        expect(s.waiting.filter(t => t.groupId === "group_1").every(t => t.heldUntil === 6.25)).toBe(true);
        expect(s.waiting.filter(t => t.groupId === "group_2").every(t => t.heldUntil === undefined)).toBe(true);
        const file = replayFile(finish(e), fixture());
        expect(file.actions[0].affectedCount).toBe(5);
        expect(file.finalMetrics.remainingHoldPassengerMinutes).toBe(0);
    });
    it("rejects invalid groups, holds, disconnected/closed corridors and use in Monday atomically", () => {
        const e = make();
        e.step();
        const before = e.exportSnapshot();
        for (const action of [{ type: "ROUTE_GROUP", groupId: "group_1", corridorId: "missing" }, { type: "ROUTE_GROUP", groupId: "missing", corridorId: "north" }, { type: "HOLD_GROUP", groupId: "group_1", durationMinutes: NaN }] as SimulationAction[]) {
            expect(e.step(action).info.actionRejected).toBeTruthy();
            expect(e.exportSnapshot()).toEqual(before);
            expect(() => e.previewAction(action)).toThrow();
        }
        const blocked = make();
        blocked.step();
        blocked.graph.edge("south_bridge").closed = true;
        const frozen = blocked.exportSnapshot();
        expect(blocked.step({ type: "ROUTE_GROUP", groupId: "group_1", corridorId: "south" }).info.actionRejected).toContain("unavailable");
        expect(blocked.exportSnapshot()).toEqual(frozen);
        const disconnected = fixture();
        disconnected.graph.edges = disconnected.graph.edges.filter(e => e.id !== "cedar_south");
        const d = make(disconnected);
        d.step();
        expect(d.step({ type: "ROUTE_GROUP", groupId: "group_1", corridorId: "south" }).info.actionRejected).toContain("unavailable");
        expect(make(mondayMorningScenario).step({ type: "ROUTE_GROUP", groupId: "group_1", corridorId: "north" }).info.actionRejected).toContain("unavailable");
    });
    it("preview and real action have identical affected counts and 15-minute metrics without mutating source", () => {
        const e = make(twoBridgesScenario);
        e.step();
        const before = e.exportSnapshot(), action: SimulationAction = { type: "ROUTE_GROUP", groupId: "group_1", corridorId: "south" };
        const preview = e.previewAction(action);
        expect(e.exportSnapshot()).toEqual(before);
        const a = make(twoBridgesScenario), b = make(twoBridgesScenario);
        a.restoreFromSnapshot(before);
        b.restoreFromSnapshot(before);
        a.step(action);
        b.step();
        while (a.getState().time < before.time + preview.horizonMinutes) {
            a.step();
            b.step();
        }
        expect(preview.affectedVehicles).toBe(a.createRun().actions[0].affectedCount);
        expect(preview.networkCostDelta).toBeCloseTo(a.getObservation().metrics.objective - b.getObservation().metrics.objective, 8);
    });
    it("keeps Monday version compatibility and verifies a full experimental group-action replay through clearance", () => {
        expect(engineVersionFor(mondayMorningScenario)).toBe("0.5.0");
        expect(engineVersionFor(twoBridgesScenario)).toBe("0.5.0+groups.1");
        const e = make(twoBridgesScenario);
        const chosen = new Set<string>();
        while (!e.isDone()) {
            const t = e.getState().waiting.find(t => t.groupId && !t.groupDecided);
            const id = t?.groupId;
            e.step(id && !chosen.has(id) ? (chosen.add(id), { type: "ROUTE_GROUP", groupId: id, corridorId: chosen.size % 2 ? "north" : "south" }) : { type: "NO_OP" });
        }
        const file = replayFile(e, twoBridgesScenario);
        expect(file.actions).toHaveLength(6);
        expect(file.decisionCutoffMetrics.tripsRequested).toBe(300);
        expect(file.evaluation.finishReason).toBe("all-arrived");
        expect(file.finalMetrics.tripsCompleted).toBe(300);
        expect(() => parseRunFile(JSON.stringify({ ...file, engineVersion: "0.5.0" }), twoBridgesScenario)).toThrow("engine");
        expect(() => parseRunFile(JSON.stringify(file), mondayMorningScenario)).toThrow();
    }, 10000);
    it("rejects mistimed or duplicated group decisions and stops rejected headless replays", () => {
        const s = fixture(), e = make(s);
        e.step();
        e.step({ type: "ROUTE_GROUP", groupId: "group_1", corridorId: "north" });
        finish(e);
        const file = createCompletedRun(e);
        const early = structuredClone(file);
        early.actions[0].simulationTime = .25;
        early.actions[0].stateSnapshotId = "t_0.25";
        expect(() => parseRunFile(JSON.stringify(early), s)).toThrow("follow request generation");
        const twice = structuredClone(file);
        twice.actions.push({ ...twice.actions[0], simulationTime: .75, stateSnapshotId: "t_0.75" });
        expect(() => parseRunFile(JSON.stringify(twice), s)).toThrow("only once");
        const raw = e.createRun();
        raw.actions[0].simulationTime = 7.75;
        raw.actions[0].stateSnapshotId = "t_7.75";
        expect(() => replayRun(s, raw)).toThrow("Replay action rejected");
    });
    it("deep-copies batch and corridor configuration through snapshots", () => {
        const e = make(), snapshot = e.exportSnapshot();
        snapshot.scenario.demand.batches![0].size = 999;
        snapshot.scenario.departureGroups!.corridors[0].viaEdge = "missing";
        e.step();
        expect(e.getState().waiting).toHaveLength(5);
        expect(e.groupRoute(e.getState().waiting[0], "north")).toContain("north_bridge");
        const copy = make();
        copy.restoreFromSnapshot(e.exportSnapshot());
        finish(e);
        finish(copy);
        expect(finalStateChecksum(copy.exportSnapshot())).toBe(finalStateChecksum(e.exportSnapshot()));
    });
    it("counts actual arrival timestamps at the deadline and defines completed-population delay", () => {
        const e = make();
        e.step();
        finish(e);
        const s = e.getState(), at = s.vehicles[0].actualArrivalTime!;
        const outcome = challengeOutcome(e, fixture().startTime + at, fixture().startTime);
        expect(outcome.byDeadline).toBe(s.vehicles.filter(v => v.actualArrivalTime! <= at).length);
        expect(outcome.completed).toBe(10);
        expect(outcome.averageDelay).toBeGreaterThan(0);
        expect(challengeOutcome(e, fixture().startTime, fixture().startTime).byDeadline).toBe(0);
    });
});
class PreviewDouble {
    static instances: PreviewDouble[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    message: any;
    terminated = false;
    constructor() { PreviewDouble.instances.push(this); }
    postMessage(m: any) { this.message = m; }
    terminate() { this.terminated = true; }
    reply() { const m = this.message; if (m.kind)
        return; const e = make(m.snapshot.scenario); e.restoreFromSnapshot(m.snapshot); this.onmessage?.({ data: { requestId: m.requestId, sessionId: m.sessionId, result: e.previewAction(m.action), timings: { calculationMs: 1, roundTripStartedAt: 0 } } } as MessageEvent); }
}
let host: HTMLDivElement, root: Root;
function click(name: string) { const b = [...host.querySelectorAll('button')].find(b => b.textContent?.startsWith(name)); if (!b)
    throw Error(`Missing ${name}`); act(() => b.click()); }
function UI() { return useGameStore(s => s.scenarioMode) === "twoBridges" ? <TwoBridgesChallenge /> : <p>Monday Morning</p>; }
function mount(fullApp = false) { host = document.createElement('div'); document.body.append(host); root = createRoot(host); act(() => root.render(fullApp ? <App /> : <UI />)); }
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('Worker', PreviewDouble); vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); PreviewDouble.instances = []; useGameStore.getState().setScenarioMode('twoBridges'); });
afterEach(() => { if (root)
    act(() => root.unmount()); host?.remove(); act(() => useGameStore.getState().setScenarioMode('practice')); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("experimental interaction", () => {
    it("respects reduced-motion preference without advancing or changing traffic", () => {
        vi.stubGlobal("matchMedia", () => ({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
        const engine=useGameStore.getState().engine, before=engine.exportSnapshot();
        mount();
        expect(host.textContent).toContain("Reduced motion · moving markers hidden; traffic still runs");
        expect(engine.exportSnapshot()).toEqual(before);
    });

    it("retains action feedback while paused and clears route highlighting on reset", () => {
        vi.useFakeTimers(); mount(); click("Start the rush"); act(() => useGameStore.getState().step());
        click("Preview South"); act(() => PreviewDouble.instances.at(-1)!.reply()); click("Apply");
        expect(host.querySelectorAll('line[stroke="#b25533"]').length).toBeGreaterThan(0);
        act(() => vi.advanceTimersByTime(6000));
        expect(host.textContent).toContain("50 actual commuters affected");
        expect(host.textContent).toContain("Resume 1x to watch");
        click("Reset");
        expect(host.querySelectorAll('line[stroke="#b25533"]')).toHaveLength(0);
        expect(useGameStore.getState().lastActionNotice).toBeNull();
        expect(useGameStore.getState().engine.createRun().actions).toHaveLength(0);
    });

    it("counts local active playback time while excluding pauses without affecting engine time", () => {
        const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
        const scenario = fixture();
        useGameStore.setState({engine: make(scenario), scenario});
        mount(); click("Start the rush"); act(() => useGameStore.getState().step());
        click("1x"); clock.mockReturnValue(4000); click("Pause");
        const time = useGameStore.getState().engine.getState().time;
        clock.mockReturnValue(100000);
        expect(useGameStore.getState().engine.getState().time).toBe(time);
        act(() => { while (!useGameStore.getState().engine.isDone()) useGameStore.getState().step(); });
        expect(host.textContent).toContain("Active playback 0:03");
        expect(useGameStore.getState().engine.createRun().actions).toHaveLength(0);
    });

    it("uses explicit worker Preview/Cancel/Apply, preserves hover speed, and rejects reset's obsolete worker", () => {
        mount();
        click('Start the rush');
        act(() => useGameStore.getState().step());
        expect(useGameStore.getState().speed).toBe(0);
        click('1x');
        const before = useGameStore.getState().engine.exportSnapshot(), workers = PreviewDouble.instances.length;
        const button = [...host.querySelectorAll('button')].find(b => b.textContent?.startsWith('Preview South'))!;
        act(() => { button.focus(); button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
        expect(PreviewDouble.instances).toHaveLength(workers);
        expect(useGameStore.getState().speed).toBe(1);
        expect(useGameStore.getState().engine.exportSnapshot()).toEqual(before);
        click('Preview South');
        expect(useGameStore.getState().speed).toBe(0);
        expect(PreviewDouble.instances).toHaveLength(workers + 1);
        act(() => PreviewDouble.instances.at(-1)!.reply());
        expect(host.textContent).toContain('50 affected trips');
        click('Cancel');
        expect(document.activeElement?.id).toBe('preview-group-south');
        expect(useGameStore.getState().engine.exportSnapshot()).toEqual(before);
        expect(host.textContent).toContain('No action applied');
        click('Preview South');
        click('Apply');
        expect(useGameStore.getState().engine.createRun().actions).toHaveLength(1);
        expect(useGameStore.getState().engine.createRun().actions[0].affectedCount).toBe(50);
        expect(host.textContent).toContain('50 actual commuters affected');
        click('Reset');
        click('Start the rush');
        act(() => useGameStore.getState().step());
        click('Preview North');
        const old = PreviewDouble.instances.at(-1)!;
        click('Reset');
        act(() => old.reply());
        expect(useGameStore.getState().preview.status).toBe('idle');
        expect(useGameStore.getState().engine.createRun().actions).toHaveLength(0);
    });
    it("labels an unresolved challenge incomplete and preserves unfinished counts", () => {
        const scenario = fixture(); scenario.evaluation = {maxClearanceMinutes:.25}; scenario.departureGroups!.arrivalDeadline = scenario.endTime + .25;
        const engine = make(scenario); engine.step(); engine.step({type:"HOLD_GROUP",groupId:"group_1",durationMinutes:90}); finish(engine);
        useGameStore.setState({engine, scenario, scenarioMode:"twoBridges"}); mount();
        expect(host.textContent).toContain("Evaluation incomplete");
        expect(host.textContent).toContain(`${engine.getObservation().metrics.waitingTrips} waiting`);
        expect(host.textContent).toContain("not full-journey costs");
        expect(host.textContent).toContain("not comparable final results");
    });
    it("presents honest results, same-traffic retry and return to Monday", () => {
        const e = make();
        finish(e);
        useGameStore.setState({ engine: e, scenario: fixture(), scenarioMode: 'twoBridges' });
        mount();
        expect(host.textContent).toContain('arrived by');
        expect(host.textContent).toContain('10 completed in total');
        expect(host.textContent).toContain('per completed commuter');
        click('Try Again With Same Traffic');
        expect(useGameStore.getState().seed).toBe(428193);
        expect(useGameStore.getState().engine.getState().time).toBe(0);
        click('Return to Monday Morning');
        expect(useGameStore.getState().scenarioMode).toBe('monday');
        expect(useGameStore.getState().scenario.version).toBe(4);
    });
});


describe("arrival goal, urgency and observed feedback", () => {
    it("rejects the previous experimental scenario export explicitly", () => {
        const old = readFileSync("docs/measurements/two-bridges/example-run.json", "utf8");
        expect(() => parseRunFile(old, twoBridgesScenario)).toThrow("scenario");
    });
    it("keeps the configured target identical in intro, gameplay, Help and results", () => {
        const scenario = fixture(), engine = make(scenario), goal = crossingGoal(scenario);
        useGameStore.setState({scenario, engine}); mount();
        expect(host.querySelector('.bayIntro')!.textContent).toContain(goal.text);
        expect(host.querySelector('.bayStatus')!.textContent).toContain(`/ ${goal.target} target arrivals`);
        click('Help'); expect(host.querySelector('[role="dialog"]')!.textContent).toContain(goal.text);
        click('Return To Game'); click('Start the rush');
        act(() => { while (!engine.isDone()) useGameStore.getState().step(); });
        const dialog = host.querySelector('[role="dialog"]')!;
        expect(dialog.textContent).toContain(goal.text);
        const actual = challengeOutcome(engine, scenario.departureGroups!.arrivalDeadline, scenario.startTime);
        expect(dialog.textContent).toContain(`Target ${actual.byDeadline >= goal.target ? 'met' : 'missed'}`);
        expect(dialog.textContent).toContain('Try a different crossing plan');
    });
    it("uses real request eligibility and the actual App timer stops countdowns on Pause", () => {
        vi.useFakeTimers(); mount(true); click('Start the rush');
        act(() => vi.advanceTimersByTime(250)); // First real group pauses.
        const tray = () => host.querySelector('.bayGroupChoices')!.textContent;
        expect(tray()).toContain('12.00 simulated min');
        click('1x'); act(() => vi.advanceTimersByTime(250));
        expect(tray()).toContain('11.75 simulated min');
        click('Pause'); const text = tray(), time = useGameStore.getState().engine.getState().time;
        act(() => vi.advanceTimersByTime(5000));
        expect(tray()).toBe(text); expect(useGameStore.getState().engine.getState().time).toBe(time);
        const trip = useGameStore.getState().engine.getState().waiting[0];
        expect(groupEligibility([{...trip, availableAt:30}], 20)).toContain('10.00 simulated min');
        expect(host.querySelector('.bayGroupChoices')!.closest('[aria-live]')).toBeNull();
    });
    it("labels expired undecided requests queued when actual storage blocks entry", () => {
        const scenario = fixture(); scenario.graph.edges.filter(e => e.from === 'cedar').forEach(e => e.maximumCapacity = 0);
        const engine = make(scenario); useGameStore.setState({scenario, engine}); mount(); click('Start the rush');
        act(() => { while (engine.getState().time < 3.5) useGameStore.getState().step(); });
        expect(engine.getState().waiting.filter(t => t.groupId === 'group_1')).toHaveLength(5);
        expect(host.querySelector('.bayGroupChoices')!.textContent).toContain('5 eligible now · queued for road entry');
        expect(host.querySelector('.bayGroupChoices')!.textContent).not.toContain('-0.');
    });
    it("leads with compact units/horizon and retains metrics in expandable details, including Retry", () => {
        mount(); click('Start the rush'); act(() => useGameStore.getState().step()); click('Preview South');
        act(() => PreviewDouble.instances.at(-1)!.onerror?.({message:'Worker unavailable'} as ErrorEvent));
        expect(useGameStore.getState().preview.status).toBe('error'); click('Retry');
        act(() => PreviewDouble.instances.at(-1)!.reply());
        const review = host.querySelector('[aria-label="Action review"]')!, summary = review.querySelector('.statGrid')!.textContent!;
        const result = useGameStore.getState().preview.result!;
        expect(summary).toContain('Commuters affected50'); expect(summary).toContain('minutes per rider');
        expect(summary).toContain(`Actual projection horizon${result.horizonMinutes} min`);
        expect(summary).toContain('Selected bridge pressureSouth Bridge');
        expect(summary).toContain('Most affected alternative road'); expect(summary).not.toContain('System-cost');
        expect(review.textContent).toContain('Negative delay means less delay');
        expect(review.textContent).toContain('not a guaranteed arrival time');
        const details = review.querySelector('details')!; expect(details.open).toBe(false);
        act(() => { details.querySelector('summary')!.click(); }); expect(details.open).toBe(true);
        expect(details.textContent).toContain('passenger-minutes'); expect(details.textContent).toContain('percentage points');
        expect(details.textContent).toContain('lower cost is better');
        expect(details.querySelectorAll('div')).toHaveLength(result.forecastChanges.length);
        click('1x'); act(() => useGameStore.getState().step());
        expect(useGameStore.getState().preview.status).toBe('stale');
        expect([...review.querySelectorAll('button')].some(b => b.textContent === 'Apply')).toBe(false);
        click('Retry'); act(() => PreviewDouble.instances.at(-1)!.reply());
        const before = useGameStore.getState().engine.exportSnapshot(); click('Cancel');
        expect(document.activeElement?.id).toBe('preview-group-south');
        expect(useGameStore.getState().engine.exportSnapshot()).toEqual(before);
    });
    it("observes real arrivals, corridor entry and queue changes once without changing deterministic state", () => {
        const scenario = fixture();
        scenario.graph.edges.find(e => e.id === "north_bridge")!.maximumCapacity = 2;
        const engine = make(scenario);
        let previous = trafficPresentation(engine.getState().vehicles, scenario), arrivals = 0, entries = 0, queues = 0;
        engine.step(); engine.step({type:'ROUTE_GROUP',groupId:'group_1',corridorId:'north'});
        while (!engine.isDone()) {
            engine.step(); const before = finalStateChecksum(engine.exportSnapshot());
            const next = trafficPresentation(engine.getState().vehicles, scenario);
            const changes = trafficTransitions(previous, next, scenario);
            arrivals += changes.arrivals; entries += changes.messages.filter(m => m.includes('entering')).length;
            queues += changes.messages.filter(m => m.includes('Exit queues')).length;
            expect(trafficTransitions(next, next, scenario).messages).toEqual([]);
            expect(finalStateChecksum(engine.exportSnapshot())).toBe(before); previous = next;
        }
        expect(arrivals).toBe(engine.getObservation().metrics.tripsCompleted); expect(entries).toBeGreaterThan(0); expect(queues).toBeGreaterThan(0);
    }, 10000);
    it("keeps real feedback readable with reduced motion, bounds it without duplicate rerenders, and clears on retry", () => {
        vi.useFakeTimers();
        vi.stubGlobal('matchMedia', () => ({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
        const scenario = fixture(), engine = make(scenario); useGameStore.setState({scenario, engine}); mount(); click('Start the rush');
        const progressText = () => host.querySelector('[aria-label="Observed traffic"]')!.textContent;
        act(() => { while (engine.getState().time < 4) useGameStore.getState().step(); });
        expect(progressText()).toContain('entering North Bridge');
        act(() => vi.advanceTimersByTime(3000));
        act(() => { while (!engine.isDone()) useGameStore.getState().step(); });
        const progress = () => host.querySelector('[aria-label="Observed traffic"]')!.textContent;
        expect(progress()).toContain(`${engine.getObservation().metrics.tripsCompleted} at Bay Works`);
        expect(progress()).toContain('recent arrivals'); const text = progress();
        act(() => root.render(<UI />)); expect(progress()).toBe(text);
        act(() => vi.advanceTimersByTime(1001)); expect(progress()).not.toContain('recent arrivals');
        expect(progress()).toContain('10 at Bay Works');
        click('Try Again With Same Traffic');
        expect(progress()).toContain('0 at Bay Works'); expect(progress()).not.toContain('recent arrivals');
        expect(progress()).not.toContain('entering');
    });
});


it("retains selected group-bridge pressure even when both projected branches are identical there", () => {
    const engine = make(twoBridgesScenario); engine.step();
    const result = engine.previewAction({type:'ROUTE_GROUP',groupId:'group_1',corridorId:'north'});
    const pressure = result.forecastChanges.find(c => c.edgeId === 'north_bridge' && c.actualHorizonMinutes === result.horizonMinutes);
    expect(pressure).toBeDefined(); expect(pressure!.before).toBe(pressure!.after);
    const before = engine.exportSnapshot();
    mount(); click('Start the rush'); act(() => useGameStore.getState().step()); click('Preview North');
    act(() => PreviewDouble.instances.at(-1)!.reply());
    expect(host.querySelector('[aria-label="Action review"] .statGrid')!.textContent).toContain('Selected bridge pressureNorth Bridge');
    expect(engine.exportSnapshot()).toEqual(before);
});


it("keeps keyboard recovery through Cancel, async Retry, Apply and Help without changing action semantics", () => {
    // DOM behavior only. Real-browser computed-style checks establish contrast.
    mount(); click('Start the rush'); act(() => useGameStore.getState().step());
    click('1x');
    const engine = useGameStore.getState().engine, before = engine.exportSnapshot();
    const north = host.querySelector<HTMLButtonElement>('#preview-group-north')!;
    act(() => north.focus()); expect(useGameStore.getState().speed).toBe(1);
    expect(useGameStore.getState().preview.status).toBe('idle'); expect(engine.exportSnapshot()).toEqual(before);
    click('Preview North');
    expect(useGameStore.getState().preview.status).toBe('loading');
    click('Cancel'); expect(document.activeElement?.id).toBe('preview-group-north');
    expect(engine.exportSnapshot()).toEqual(before);
    click('Preview South');
    act(() => PreviewDouble.instances.at(-1)!.onerror?.({message:'Worker unavailable'} as ErrorEvent));
    const retry = [...host.querySelectorAll('button')].find(b => b.textContent === 'Retry')!;
    act(() => retry.focus()); click('Retry');
    act(() => PreviewDouble.instances.at(-1)!.reply());
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Action review');
    click('Apply'); expect(document.activeElement?.id).toBe('bay-resume');
    expect(engine.createRun().actions).toHaveLength(1); expect(engine.createRun().actions[0].affectedCount).toBe(50);
    const help = [...host.querySelectorAll('button')].find(b => b.textContent === 'Help')!;
    act(() => help.focus()); click('Help'); click('Return To Game');
    expect(document.activeElement).toBe(help); expect(engine.createRun().actions).toHaveLength(1);
});
