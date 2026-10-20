import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrafficMap } from "../components/TrafficMap";
import { Modal } from "../components/Modal";
import { HelpPanel } from "../components/HelpPanel";
import { RoadInspector } from "../components/RoadInspector";
import { TutorialCoach } from "../components/TutorialCoach";
import { RunFiles } from "../components/RunFiles";
import { App } from "../components/App";
import { useGameStore } from "../game/GameStore";
import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { mondayMorningScenario } from "../simulation/scenarios/MondayMorning";
import { createCompletedRun } from "../simulation/logging/RunFile";

function calculatePreview(message: any) {
  const engine = new SimulationEngine(message.snapshot.scenario); engine.restoreFromSnapshot(message.snapshot);
  return { requestId: message.requestId, sessionId: message.sessionId, result: engine.previewAction(message.action), timings: { calculationMs: 1, roundTripStartedAt: 0 } };
}
class WorkerDouble {
  static all: WorkerDouble[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  message: any;
  constructor() { WorkerDouble.all.push(this); }
  postMessage(message: any) { this.message = message; }
  terminate() {}
}
let close: (() => void) | undefined;
function mount(ui: React.ReactNode) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); act(() => root.render(ui));
  close = () => { act(() => root.unmount()); host.remove(); };
  return host;
}
const button = (host: ParentNode, name: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === name)!;
function key(element: HTMLElement, name: string, shiftKey = false) {
  let allowed = false;
  act(() => { allowed = element.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }));
    // JSDOM has no native keyboard default activation.
    if (allowed && name === 'Enter' && element instanceof HTMLButtonElement) element.click(); });
  return allowed;
}
function activate(element: HTMLElement) { element.focus(); key(element, 'Enter'); }
beforeEach(() => {
  vi.stubGlobal('Worker', WorkerDouble); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useGameStore.getState().startFreePractice(); useGameStore.getState().setSpeed(0); WorkerDouble.all = [];
});
afterEach(() => { close?.(); close = undefined; useGameStore.getState().setScenarioMode('practice'); vi.unstubAllGlobals(); });

describe('desktop focus and semantic interactions', () => {
  it('enters Help, traps both directions, blocks background activation, and restores its origin on Escape', () => {
    const host = mount(<><button onClick={useGameStore.getState().openHelp}>Help</button><button onClick={() => useGameStore.getState().step()}>Background action</button><HelpPanel /></>);
    const origin = button(host, 'Help'); activate(origin);
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(document.activeElement).toBe(dialog); expect(origin.closest('[inert]')).toBeTruthy();
    const first = button(dialog, 'Return To Game'), last = button(dialog, 'Replay Tutorial');
    key(dialog, 'Tab'); expect(document.activeElement).toBe(first);
    key(first, 'Tab', true); expect(document.activeElement).toBe(last);
    key(last, 'Tab'); expect(document.activeElement).toBe(first);
    const before = useGameStore.getState().engine.exportSnapshot();
    activate(button(host, 'Background action'));
    expect(dialog.contains(document.activeElement)).toBe(true); expect(useGameStore.getState().engine.exportSnapshot()).toEqual(before);
    key(dialog, 'Escape'); expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(origin); expect(origin.closest('[inert]')).toBeNull();
  });
  it('nested confirmation isolates Help, Escape returns to Replay Tutorial, then Escape returns to Help origin', () => {
    const host = mount(<><button onClick={useGameStore.getState().openHelp}>Help</button><HelpPanel /></>);
    activate(button(host, 'Help')); activate(button(host, 'Replay Tutorial'));
    const dialogs = host.querySelectorAll<HTMLElement>('[role="dialog"]'); expect(dialogs).toHaveLength(2);
    expect(document.activeElement).toBe(dialogs[1]); expect(button(host, 'Return To Game').closest('[inert]')).toBeTruthy();
    key(dialogs[1], 'Tab', true); expect(document.activeElement).toBe(button(dialogs[1], 'Keep Current Run'));
    key(document.activeElement as HTMLElement, 'Escape'); expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.activeElement).toBe(button(host, 'Replay Tutorial'));
    key(document.activeElement as HTMLElement, 'Escape'); expect(document.activeElement).toBe(button(host, 'Help'));
  });
  it('restores pre-existing inert and aria-hidden attributes and keeps nondismissible results contained', () => {
    const host = mount(<><button aria-hidden="true" inert>Already hidden</button><Modal title="Results"><button>Retry</button></Modal></>);
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    key(dialog, 'Escape'); expect(document.activeElement).toBe(dialog);
    key(dialog, 'Tab'); expect(document.activeElement).toBe(button(dialog, 'Retry'));
    key(document.activeElement as HTMLElement, 'Tab'); expect(document.activeElement).toBe(button(dialog, 'Retry'));
    const hidden = button(host, 'Already hidden'); close!(); close = undefined;
    expect(hidden.hasAttribute('inert')).toBe(true); expect(hidden.getAttribute('aria-hidden')).toBe('true');
  });
  it('selects roads without Canvas and focus/hover cannot pause playback or request a calculation', () => {
    useGameStore.getState().setSpeed(4);
    const host = mount(<RoadInspector />), select = host.querySelector<HTMLSelectElement>('select')!;
    const before = useGameStore.getState().engine.exportSnapshot();
    select.focus(); act(() => { select.value = 'south_bridge'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(useGameStore.getState().selectedEdgeId).toBe('south_bridge'); expect(host.querySelector('h2')!.textContent).toBe('South Bridge');
    const preview = button(host, 'Preview Reroute'); preview.focus();
    act(() => preview.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(useGameStore.getState().speed).toBe(4); expect(WorkerDouble.all).toHaveLength(0); expect(useGameStore.getState().engine.exportSnapshot()).toEqual(before);
    expect(host.querySelector('[aria-label="Selected road forecast"]')?.getAttribute('tabindex')).toBe('0');
  });
  it('keyboard Preview/Cancel/Apply uses the reviewed action exactly once and restores focus', () => {
    const host = mount(<RoadInspector />), original = button(host, 'Preview Reroute');
    const before = useGameStore.getState().engine.exportSnapshot(); activate(original);
    expect(useGameStore.getState().speed).toBe(0); expect(WorkerDouble.all).toHaveLength(1);
    const worker = WorkerDouble.all[0]; act(() => worker.onmessage?.({ data: calculatePreview(worker.message) } as MessageEvent));
    const review = host.querySelector<HTMLElement>('[aria-label="Action review"]')!; expect(document.activeElement).toBe(review);
    expect(useGameStore.getState().engine.exportSnapshot()).toEqual(before);
    activate(button(host, 'Cancel')); expect(useGameStore.getState().engine.exportSnapshot()).toEqual(before);
    expect(document.activeElement).toBe(button(host, 'Preview Reroute'));
    activate(button(host, 'Preview Reroute')); const reviewed = useGameStore.getState().preview.action;
    activate(button(host, 'Apply'));
    expect(useGameStore.getState().engine.createRun().actions).toHaveLength(1);
    expect(useGameStore.getState().engine.createRun().actions[0].action).toEqual(reviewed);
    key(document.activeElement as HTMLElement, 'Enter'); // opens another review; cannot apply the consumed review twice
    expect(useGameStore.getState().engine.createRun().actions).toHaveLength(1);
  });
  it('changing the reviewed road preserves keyboard focus in the selector', () => {
    const host = mount(<RoadInspector />); activate(button(host, 'Preview Reroute'));
    const worker = WorkerDouble.all[0]; act(() => worker.onmessage?.({ data: calculatePreview(worker.message) } as MessageEvent));
    const select = host.querySelector<HTMLSelectElement>('select')!; select.focus();
    act(() => { select.value = 'south_bridge'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(document.activeElement).toBe(select); expect(host.querySelector('[aria-label="Action review"]')).toBeNull();
    expect(useGameStore.getState().engine.createRun().actions).toHaveLength(0);
  });
  it('keeps keyboard Retry focused on review while the temporary control is replaced', () => {
    const host = mount(<RoadInspector />); activate(button(host, 'Preview Reroute'));
    const worker = WorkerDouble.all[0]; act(() => worker.onmessage?.({ data: calculatePreview(worker.message) } as MessageEvent));
    act(() => useGameStore.getState().step());
    activate(button(host, 'Retry'));
    expect(document.activeElement).toBe(host.querySelector('[aria-label="Action review"]'));
    const next = WorkerDouble.all.filter(item => item.message?.action).at(-1)!;
    act(() => next.onmessage?.({ data: calculatePreview(next.message) } as MessageEvent));
    expect(document.activeElement).toBe(host.querySelector('[aria-label="Action review"]'));
  });
  it('retains modal focus when completion removes its focused temporary control', () => {
    function Content() {
      const [done, setDone] = React.useState(false);
      return <Modal title="Comparison">{done ? <p>Comparison ready</p> : <button onClick={() => setDone(true)}>Retry comparison</button>}</Modal>;
    }
    const host = mount(<Content />); activate(button(host, 'Retry comparison'));
    expect(document.activeElement).toBe(host.querySelector('[role="dialog"]'));
    expect(host.textContent).toContain('Comparison ready');
  });
  it('tutorial follows the same keyboard action flow and focuses the next usable control after cancellation', () => {
    useGameStore.getState().startPracticeFromHelp();
    const host = mount(<><RoadInspector /><TutorialCoach /></>);
    activate(button(host, 'Continue')); expect(document.activeElement).toBe(host.querySelector('select'));
    const select = host.querySelector<HTMLSelectElement>('select')!;
    act(() => { select.value = 'north_bridge'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(document.activeElement).toBe(host.querySelector('[aria-label="Selected road forecast"]'));
    activate(button(host, 'Continue')); activate(button(host, 'Preview Reroute'));
    const worker = WorkerDouble.all.filter(item => item.message?.action).at(-1)!;
    act(() => worker.onmessage?.({ data: calculatePreview(worker.message) } as MessageEvent));
    expect(useGameStore.getState().tutorial.step).toBe('review');
    activate(button(host, 'Cancel')); expect(useGameStore.getState().tutorial.step).toBe('preview');
    expect(document.activeElement).toBe(button(host, 'Preview Reroute'));
    activate(button(host, 'Preview Reroute')); activate(button(host, 'Apply'));
    expect(useGameStore.getState().tutorial.step).toBe('observe'); expect(document.activeElement).toBe(button(host, 'Resume 1x'));
    activate(button(host, 'Resume 1x')); act(() => { for (let tick = 0; tick < 10; tick++) useGameStore.getState().step(); });
    activate(button(host, 'Continue')); activate(button(host, 'Start Monday Morning'));
    expect(document.activeElement).toBe(host.querySelector('select'));
  });
  it('announces action transitions but mutates no live-region content on ordinary paused or playback ticks', () => {
    const host = mount(<RoadInspector />); activate(button(host, 'Preview Reroute'));
    const worker = WorkerDouble.all[0]; act(() => worker.onmessage?.({ data: calculatePreview(worker.message) } as MessageEvent));
    expect(host.querySelector('[role="status"]')!.textContent).toContain('Preview ready'); activate(button(host, 'Apply'));
    const announced = host.querySelector('[role="status"]')!; const text = announced.textContent;
    const observer = new MutationObserver(vi.fn()); observer.observe(announced, { subtree: true, childList: true, characterData: true });
    act(() => { for (let i = 0; i < 8; i++) useGameStore.getState().step(); });
    expect(announced.textContent).toBe(text); expect(observer.takeRecords()).toHaveLength(0); observer.disconnect();
  });
  it('responds to reduced-motion preference changes without changing simulation or playback', () => {
    let listener = () => {};
    const preference = { matches: false, addEventListener: (_name: string, fn: () => void) => { listener = fn; }, removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', () => preference); useGameStore.getState().setSpeed(4);
    const before = useGameStore.getState().engine.exportSnapshot(); const host = mount(<TrafficMap />);
    expect(host.textContent).not.toContain('Reduced motion:');
    act(() => { preference.matches = true; listener(); });
    expect(host.textContent).toContain('moving vehicle markers hidden');
    expect(useGameStore.getState().speed).toBe(4); expect(useGameStore.getState().engine.exportSnapshot()).toEqual(before);
  });
  it('import confirmation enters a nested dialog and Escape returns to the actual file control', () => {
    const engine = new SimulationEngine(mondayMorningScenario, undefined, true); engine.reset(428193); while (!engine.isDone()) engine.step();
    const run = createCompletedRun(engine);
    const host = mount(<RunFiles />), input = host.querySelector<HTMLInputElement>('input')!; input.focus();
    act(() => useGameStore.getState().importRun(JSON.stringify(run)));
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(document.activeElement).toBe(dialog); expect(input.closest('[inert]')).toBeTruthy();
    key(dialog, 'Escape'); expect(document.activeElement).toBe(input); expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it('results receive focus, block background playback and provide keyboard retry', () => {
    const host = mount(<App />), origin = button(host, 'Pause'); origin.focus();
    act(() => { while (!useGameStore.getState().engine.isDone()) useGameStore.getState().step(); });
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(document.activeElement).toBe(dialog); expect(button(host, 'Help').closest('[inert]')).toBeTruthy();
    activate(button(host, 'Practice Again')); expect(useGameStore.getState().engine.isDone()).toBe(false);
    expect(useGameStore.getState().tutorial.active).toBe(false);
    expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(origin);
    expect(button(host, 'Help').closest('[inert]')).toBeNull();
  });
});
