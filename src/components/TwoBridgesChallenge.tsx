import { baselineIdentity } from "../simulation/logging/Identity";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGameStore } from "../game/GameStore";
import { formatClock } from "../game/ScenarioProgress";
import { utilization } from "../simulation/traffic/CongestionModel";
import { PreviewReview } from "./PreviewReview";
import { ClearanceControls } from "./ClearanceControls";
import { DecisionHistory } from "./DecisionHistory";
import { RunFiles } from "./RunFiles";
import { Modal } from "./Modal";
import { HelpPanel } from "./HelpPanel";
import type { SimulationEngine } from "../simulation/core/SimulationEngine";
import { crossingGoal, groupEligibility, trafficPresentation, trafficTransitions } from "./TwoBridgesFeedback";
import "./two-bridges.css";
export function challengeOutcome(engine: SimulationEngine, deadline: number, start: number) {
    const state = engine.getState(), arrived = state.vehicles.filter(v => v.status === "arrived");
    return { byDeadline: arrived.filter(v => v.actualArrivalTime! <= deadline - start).length,
        completed: arrived.length, waiting: state.waiting.length, active: state.metrics.activeTrips,
        averageDelay: arrived.length ? arrived.reduce((sum, v) => sum + Math.max(0, v.actualArrivalTime! - v.requestedDepartureTime - v.baselineTravelTime), 0) / arrived.length : null };
}
function BayMap({ selected, routes, flashed, onSelect }: {
    selected: string | null;
    routes: string[][];
    flashed: string[];
    onSelect: (id: string) => void;
}) {
    const { engine, version, scenario } = useGameStore(), canvas = useRef<HTMLCanvasElement>(null);
    const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    useEffect(() => {
        const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        if (!media)
            return;
        const change = () => setReduced(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    const state = engine.getState(), graph = state.graph, origin = scenario.demand.batches?.find(b => b.id === selected)?.origin;
    useEffect(() => {
        const el = canvas.current, ctx = el?.getContext("2d");
        if (!el || !ctx)
            return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        el.width = 1000 * dpr;
        el.height = 360 * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, 1000, 360);
        // One marker per actual in-network trip; no decorative or scripted queue.
        for (const v of state.vehicles) {
            if (v.status !== "traveling")
                continue;
            const edge = graph.edge(v.route[v.currentEdgeIndex]), a = graph.node(edge.from), b = graph.node(edge.to);
            const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy), offset = (Number(v.id.split("_").at(-1)) % 3 - 1) * 5;
            const p = v.edgeProgress;
            const packOffset = (Math.floor(Number(v.id.split("_").at(-1)) / 3) % 7 - 3) * 5;
            // Reduced motion suppresses moving markers; stopped exit queues remain legible.
            if (reduced && p < 1)
                continue;
            const distance = Math.max(4, Math.min(length - 4, length * p + packOffset));
            const x = a.x + dx / length * distance - dy / length * offset, y = a.y + dy / length * distance + dx / length * offset;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.atan2(dy, dx));
            ctx.fillStyle = v.groupId === selected ? "#fff9da" : "#253d38";
            ctx.strokeStyle = "#fffaf0";
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.roundRect(-4, -2.5, 8, 5, 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }, [engine, version, reduced, selected]);
    const previous = useRef({ engine, value: trafficPresentation(state.vehicles, scenario) });
    const [recent, setRecent] = useState({ arrivals: 0, messages: [] as string[] });
    useEffect(() => {
        const value = trafficPresentation(state.vehicles, scenario);
        if (previous.current.engine !== engine) {
            previous.current = { engine, value }; setRecent({ arrivals: 0, messages: [] }); return;
        }
        const changes = trafficTransitions(previous.current.value, value, scenario);
        previous.current.value = value;
        if (changes.messages.length) setRecent(previous => ({
            arrivals: previous.arrivals + changes.arrivals,
            messages: [...new Set([...previous.messages.filter(m => m.includes("entering")), ...changes.messages.filter(m => m.includes("entering"))])].slice(-2)
                .concat(changes.messages.filter(m => m.startsWith("Exit queues")))
        }));
    }, [engine, version]);
    useEffect(() => {
        if (!recent.messages.length && !recent.arrivals) return;
        const timer = setTimeout(() => setRecent({ arrivals: 0, messages: [] }), 4000);
        return () => clearTimeout(timer);
    }, [engine, !!(recent.messages.length || recent.arrivals)]);
    const allPaths = new Set(routes.flat()), flash = new Set(flashed);
    return <div className="bayMap" aria-label="Two shores and two bridges">
    <svg preserveAspectRatio="none" viewBox="0 0 1000 360" role="img" aria-label="Cedar Hill and Linden Park on the west shore; Bay Works on the east. North Bridge is short and narrow; South Bridge is longer with more storage.">
      <defs><pattern id="bay-paper" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r=".7" fill="#293e35" opacity=".07"/></pattern><filter id="bay-shadow"><feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#364c40" floodOpacity=".18"/></filter></defs>
      <rect width="1000" height="360" rx="24" fill="#e8e4cf"/>
      <path d="M445 0 Q375 125 439 270 Q478 350 425 480 Q391 566 470 660 H635 Q578 548 618 445 Q672 320 612 207 Q559 100 616 0Z" fill="#91b4ad"/>
      <path d="M470 0 Q400 160 469 298 M605 360 Q570 515 622 660" fill="none" stroke="#c7d6c6" strokeWidth="4" opacity=".5"/>
      <rect width="1000" height="360" fill="url(#bay-paper)" rx="24"/>
      <text x="520" y="185" className="bayWaterLabel" transform="rotate(-90 520 185)">MORNING BAY</text>
      <g fill="#b8c6a0" opacity=".85"><ellipse cx="235" cy="60" rx="94" ry="49"/><ellipse cx="220" cy="300" rx="105" ry="54"/><ellipse cx="845" cy="280" rx="65" ry="36"/></g>
      {scenario.graph.edges.map(edge => {
            const a = graph.node(edge.from), b = graph.node(edge.to), live = graph.edge(edge.id), bridge = edge.major, heavy = utilization(live) > 1;
            return <g key={edge.id}><line x1={a.x} y1={a.y + 4} x2={b.x} y2={b.y + 4} stroke="#596953" strokeOpacity=".18" strokeWidth={bridge ? 27 : 15}/>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={flash.has(edge.id) ? "#b25533" : allPaths.has(edge.id) ? "#39695d" : "#6c7563"} strokeWidth={bridge ? 25 : 14}/>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={heavy ? "#cb8053" : "#fbf3dd"} strokeWidth={bridge ? 17 : 8}/>
          {(bridge || allPaths.has(edge.id)) && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={heavy ? "#613c2b" : "#9a997d"} strokeWidth="2" strokeDasharray={heavy ? "3 5" : "10 8"}/>}</g>;
        })}
      <g className="bayBridgeLabels"><rect x="425" y="57" width="185" height="36" rx="18"/><text x="517" y="80">NORTH · SHORT + NARROW</text><rect x="425" y="293" width="185" height="36" rx="18"/><text x="517" y="316">SOUTH · LONGER + ROOMIER</text></g>
      {["north_bridge", "south_bridge"].map(id => <text key={id} x="517" y={id === "north_bridge" ? 48 : 350} textAnchor="middle" fontSize="11" fill="#304e40">{graph.edge(id).currentVehicleCount} on bridge · {state.vehicles.filter(v => v.status === "traveling" && v.route[v.currentEdgeIndex] === id && v.edgeProgress === 1).length} exit-queued</text>)}
      {[[110, 75], [155, 58], [205, 77], [106, 195], [155, 177], [205, 197]].map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`} filter="url(#bay-shadow)"><rect x="-10" y="0" width="28" height="25" rx="3" fill={i % 2 ? "#d4a479" : "#e9c49b"}/><path d="M-15 1 L4 -15 L23 1Z" fill="#866d52"/><rect x="1" y="11" width="7" height="14" fill="#687f6c"/></g>)}
      <g className={recent.arrivals ? "bayArrivalHighlight" : undefined} transform="translate(800 110)" filter="url(#bay-shadow)"><rect width="62" height="68" rx="5" fill="#c39568"/><path d="M-4 0 L30 -17 L65 0Z" fill="#6d7d6c"/>{[12, 32, 47].map(x => <g key={x} fill="#fff2c9"><rect x={x} y="15" width="8" height="10"/><rect x={x} y="36" width="8" height="10"/></g>)}</g>
      {["cedar", "linden", "work"].map(id => { const n = graph.node(id); return <g key={id}><circle cx={n.x} cy={n.y} r={origin === id || selected && id === "work" ? 20 : 12} fill="#fff9e9" stroke="#35564a" strokeWidth="4"/><circle cx={n.x} cy={n.y} r="4" fill="#35564a"/></g>; })}
      <g className="bayDistrict"><text x="155" y="158">CEDAR HILL</text><text x="155" y="278">LINDEN PARK</text><text x="835" y="230">BAY WORKS</text></g>
      {state.waiting.length > 0 && ["cedar", "linden"].map(id => { const count = state.waiting.filter(t => t.origin === id).length, n = graph.node(id); return count ? <g key={id}><rect x={n.x - 43} y={n.y + 55} width="86" height="27" rx="13" fill="#fff9e9"/><text x={n.x} y={n.y + 73} textAnchor="middle" fontSize="13" fill="#344d40">{count} waiting</text></g> : null; })}
    </svg>
    {(scenario.demand.batches ?? []).filter(b => state.waiting.some(t => t.groupId === b.id && !t.groupDecided)).map(b => { const n = graph.node(b.origin); return <button className="bayHub" style={{ left: `${n.x / 10}%`, top: `${n.y / 3.6}%` }} key={b.id} aria-label={`Select ${b.label} at ${b.origin === "cedar" ? "Cedar Hill" : "Linden Park"}`} aria-pressed={selected === b.id} onClick={() => onSelect(b.id)}>{b.label}<small>{state.waiting.filter(t => t.groupId === b.id && !t.groupDecided).length} to Bay Works</small></button>; })}
    <div className="bayMapProgress" aria-label="Observed traffic"><strong>{state.metrics.tripsCompleted} at Bay Works · {state.metrics.inNetworkQueuedTrips} exit-queued</strong>{recent.arrivals > 0 && <span>+{recent.arrivals} recent arrivals</span>}{recent.messages.map(message => <span key={message}>{message}</span>)}</div>
    <canvas ref={canvas} className="bayVehicles" aria-hidden="true"/>
    {reduced && <small className="bayMotionNote">Reduced motion · moving markers hidden; traffic still runs</small>}
  </div>;
}
export function TwoBridgesChallenge() {
    const { engine, scenario, speed, setSpeed, reset, setScenarioMode, version, requestPreview, preview, cancelPreview, previewCanceled, lastActionNotice, clearActionNotice, openHelp, baseline, retrySameSeed, replay, startReplay } = useGameStore();
    const [selected, setSelected] = useState<string | null>(null), [started, setStarted] = useState(false), [flashed, setFlashed] = useState<string[]>([]);
    // Local presentation stopwatch only: never serialized or used by simulation/replay.
    const playClock = useRef({ engine, total: 0, since: null as number | null });
    if (playClock.current.engine !== engine)
        playClock.current = { engine, total: 0, since: null };
    const firstSeen = useRef(false), start = useRef<HTMLButtonElement>(null);
    const state = engine.getState(), evaluation = engine.getEvaluation(), config = scenario.departureGroups!, event = scenario.events[0], deadline = config.arrivalDeadline, goal = crossingGoal(scenario);
    const pending = (scenario.demand.batches ?? []).filter(b => state.waiting.some(t => t.groupId === b.id && !t.groupDecided));
    const batch = scenario.demand.batches?.find(b => b.id === selected), trips = state.waiting.filter(t => t.groupId === selected && !t.groupDecided), groupReady = trips.length > 0;
    const routes = batch ? config.corridors.map(c => engine.groupRoute(batch, c.id)) : [];
    useEffect(() => { setStarted(!!replay); setSelected(null); setFlashed([]); firstSeen.current = !!replay; if (!replay)
        setSpeed(0); }, [engine]);
    useLayoutEffect(() => { if (groupReady && selected && !replay)
        document.getElementById("preview-group-north")?.focus(); }, [selected]);
    useLayoutEffect(() => { if (!started)
        start.current?.focus(); }, [started]);
    useEffect(() => { if (!firstSeen.current && pending.length) {
        firstSeen.current = true;
        setSpeed(0);
        setSelected(pending[0].id);
    } }, [version]);
    useEffect(() => {
        if (lastActionNotice && preview.status === "idle") {
            const action = engine.createRun().actions.at(-1)?.action;
            const appliedBatch = action && "groupId" in action ? scenario.demand.batches?.find(b => b.id === action.groupId) : undefined;
            setFlashed(action?.type === "ROUTE_GROUP" && appliedBatch ? engine.groupRoute(appliedBatch, action.corridorId) : []);
            // Keep feedback visible while the player is reading; the display timer
            // starts only when playback resumes, and reset clears it independently.
            if (!speed) return;
            const timer = setTimeout(() => { setFlashed([]); clearActionNotice(); }, 5000);
            return () => clearTimeout(timer);
        }
    }, [lastActionNotice, speed]);
    const select = (id: string) => { cancelPreview(); setSelected(id); };
    const outcome = challengeOutcome(engine, deadline, scenario.startTime), done = engine.isDone();
    const compatibleBaseline = done && baseline.status === "ready" && baseline.identity === baselineIdentity(scenario, engine.createRun().seed);
    useLayoutEffect(() => { const now = performance.now(), c = playClock.current; if (c.since !== null)
        c.total += now - c.since; c.since = started && speed > 0 && !done ? now : null; }, [engine, speed, started, done]);
    const activeSeconds = (playClock.current.total + (playClock.current.since === null ? 0 : performance.now() - playClock.current.since)) / 1000;
    const playTime = `${Math.floor(activeSeconds / 60)}:${Math.floor(activeSeconds % 60).toString().padStart(2, "0")}`;
    const restriction = state.time < event.time ? `Upcoming ${formatClock(scenario.startTime + event.time)}` : state.time < event.time + event.duration ? "Restriction active" : "Capacity restored";
    return <div className="twoBridges">
    <header className="bayHeader"><div><span className="bayEyebrow">CENTRAL TRAFFIC · EXPERIMENTAL CHALLENGE</span><h1>Two Bridges, One Rush<span>01 / THE MORNING CROSSING</span></h1></div><button onClick={() => setScenarioMode("monday")}>Return to Monday Morning ↗</button></header>
    <div className="bayStatus"><div><strong>{formatClock(scenario.startTime + state.time)}</strong><span>Decisions end {formatClock(scenario.endTime)} · target {goal.target} by {formatClock(deadline)}</span></div><div><strong>{outcome.byDeadline}<small> / {goal.target} target arrivals</small></strong><span>by {formatClock(deadline)} · {outcome.completed} arrived overall · {outcome.waiting} waiting · {outcome.active} traveling ({state.metrics.inNetworkQueuedTrips} exit-queued)</span></div><div><strong role="status">{restriction}</strong><span>North Bridge: {Math.round((1 - event.capacityModifier) * 100)}% less capacity · {formatClock(scenario.startTime + event.time)}–{formatClock(scenario.startTime + event.time + event.duration)}</span></div></div>
    <main className="bayTable"><BayMap selected={selected} routes={routes} flashed={flashed} onSelect={select}/>
      {!started && !replay && <section className="bayIntro"><span className="bayEyebrow">A SMALL CITY. A SHARED MORNING.</span><h2>Get commuters across the bay.</h2><p>The fast bridge won’t stay clear for long.</p><p>Goal: {goal.text}. Select a real waiting group, preview its route, then Apply or Cancel. Unchosen groups become eligible for automatic departure after 12 simulated minutes; full roads can delay entry.</p><button ref={start} onClick={() => { setStarted(true); setSpeed(1); }}>Start the rush →</button><small>About 3–5 minutes at 1x, plus your pauses. First group pauses for your decision.</small></section>}
      {started && evaluation.phase === "decision" && <section className="bayDepartures" aria-label="Departure groups"><div className="bayEyebrow">DEPARTURES · SELECT A WAITING GROUP</div>
        <div className="bayGroupChoices">{pending.map(b => <button aria-pressed={selected === b.id} key={b.id} onClick={() => select(b.id)}>{b.label} · {state.waiting.filter(t => t.groupId === b.id && !t.groupDecided).length} commuters<br /><small>{b.origin === "cedar" ? "Cedar Hill" : "Linden Park"} → Bay Works</small><small>{groupEligibility(state.waiting.filter(t => t.groupId === b.id && !t.groupDecided), state.time)}</small></button>)}</div>
        {!pending.length && <p>{scenario.demand.batches!.some(b => b.at > state.time) ? `Next group at ${formatClock(scenario.startTime + scenario.demand.batches!.find(b => b.at > state.time)!.at)}. Watch the crossings.` : "All groups have left or have a departure choice. Watch them arrive."}</p>}
        {batch && groupReady && <><h2>{batch.label}<small>{trips.length} actual waiting requests → Bay Works</small></h2><p>North is shorter; South adds distance with more room. A hold adds waiting. Choices affect only this group once.</p><div className="bayRouteButtons">{config.corridors.map((c, i) => <button id={`preview-group-${c.id}`} key={c.id} disabled={!!replay || !routes[i]?.length} onClick={() => requestPreview({ type: "ROUTE_GROUP", groupId: batch.id, corridorId: c.id })}>Preview {c.id === "north" ? "North" : "South"}<small>{routes[i]?.length ? `${routes[i].reduce((n, id) => n + engine.graph.edge(id).currentTravelTime, 0).toFixed(1)} min current-route estimate` : "Unavailable route"}</small></button>)}<button id="preview-hold" disabled={!!replay} onClick={() => requestPreview({ type: "HOLD_GROUP", groupId: batch.id, durationMinutes: 6 })}>Preview Hold<small>6 simulated minutes, then automatic route</small></button></div><small>Route estimates use current traffic, not a promised arrival. Preview simulates the next {scenario.forecast!.previewHorizonMinutes} minutes.</small></>}
      </section>}
      <aside className="bayReview" hidden={preview.status === "idle"}><PreviewReview /></aside>
    </main>
    <div className="bayFeedback" role="status">{lastActionNotice ? `${lastActionNotice.affected} actual commuters affected. ${lastActionNotice.actionType === "HOLD_GROUP" ? "Group held; waiting still counts. Resume 1x; automatic routing follows after the hold." : "Resume 1x to watch the highlighted route; projections are not observed outcomes."}` : previewCanceled ? "Preview canceled. No action applied. Resume when ready." : "Select a group at a residential hub. Solid road + dotted center = heavy traffic. Outlined routes show alternatives."}</div>
    <div className="bayToolbar" aria-label="Challenge playback"><button onClick={() => setSpeed(0)} aria-pressed={speed === 0}>Pause</button>{[1, 2, 4].map(n => <button key={n} id={n === 1 ? "bay-resume" : undefined} aria-pressed={speed === n} disabled={!started} onClick={() => setSpeed(n as 1 | 2 | 4)}>{n}x</button>)}<button onClick={reset}>Reset</button><button onClick={openHelp}>Help</button><span>Seed {useGameStore.getState().seed} · {replay ? "Replay · recorded actions only" : "One-time group choices"}</span></div>
    {replay?.error && <p role="alert">{replay.error}</p>}
    <ClearanceControls />
    <details className="bayDetails"><summary>Decision history and local replay files</summary><DecisionHistory /><RunFiles /></details>
    <HelpPanel />
    {done && <Modal title={evaluation.finishReason === "all-arrived" ? "The morning crossing is complete" : "Evaluation incomplete"} className="bayResults"><p>{replay?.verification === "verified" ? "Replay verified: actions, cutoff, final metrics, finish time and state match." : replay?.error}</p><p>Active playback {playTime} · pauses excluded (this browser run).</p><h2>{outcome.byDeadline} arrived by {formatClock(deadline)} · Target {outcome.byDeadline >= goal.target ? "met" : "missed"}</h2><p>Goal: {goal.text}. Try a different crossing plan.</p><p>Target counts actual arrival timestamps. {outcome.completed} completed in total · {outcome.waiting} waiting · {outcome.active} traveling ({state.metrics.inNetworkQueuedTrips} queued at road exits).</p><p>{outcome.averageDelay === null ? "No completed journeys yet." : `${outcome.averageDelay.toFixed(1)} minutes average delay per completed commuter: request-to-arrival minus the free-flow fastest journey, including origin waiting.`}</p><p>{evaluation.finishReason === "safety-limit" ? "Unresolved trips remain accounted for. These accrued costs are not full-journey costs." : "All requested trips arrived. Try another approach with the same traffic and compare."}</p><p>{state.metrics.objective.toFixed(1)} {evaluation.finishReason === "safety-limit" ? "accrued" : "final realized"} system cost · lower is better.</p><p>No-intervention reference: {compatibleBaseline ? `${baseline.metrics!.objective.toFixed(1)} cost · ${baseline.evaluation?.finishReason === "all-arrived" ? "all arrived" : "incomplete; not a comparable final score"}` : "calculating or unavailable"}. This is a reference, not an optimal strategy. {evaluation.finishReason !== "all-arrived" || baseline.evaluation?.finishReason !== "all-arrived" ? "Statuses and costs are shown separately; these are not comparable final results." : ""}</p><button onClick={retrySameSeed}>Try Again With Same Traffic</button><button onClick={() => setScenarioMode("monday")}>Return to Monday Morning</button><button onClick={() => startReplay()}>Watch Replay</button><RunFiles /></Modal>}
  </div>;
}
