import { useGameStore } from "../game/GameStore";
import { crossingGoal } from "./TwoBridgesFeedback";
import { Modal } from "./Modal";

export function HelpPanel() {
  const { help, closeHelp, showReplayConfirmation, cancelReplayConfirmation, startPracticeFromHelp, scenarioMode, scenario } = useGameStore();
  if (!help.open) return null;
  return <>
    <Modal title="How To Play" onDismiss={closeHelp}>
      {scenarioMode === "twoBridges" ? <><p>Goal: {crossingGoal(scenario).text}.</p><p>Select a real waiting group at Cedar Hill or Linden Park. Preview North, South or a brief Hold, review the projected effects, then Apply or Cancel. Hover/focus never calculates.</p><p>Each choice affects only that group once. Unchosen groups become eligible for automatic departure after their 12-minute decision window. Eligibility does not guarantee road entry: full roads can keep requests queued. Countdown uses simulated time and stops when paused. North is shorter and narrow; South is longer with more space. Holds add origin waiting and then release to automatic routing.</p><p>The clock shows when decisions end and the separate arrival target. Existing trips continue through clearance. Watch or fast-forward; cancel keeps progress. Results count actual arrivals by the target.</p></> : <><p>Keep the morning commute moving by watching forecasts, previewing actions, and applying only the tradeoffs you want.</p>
      <ul>
        <li>Select a road using Inspect road or the map. Tab to its forecast to read current predictions.</li>
        <li>Preview reroutes or holds before applying them. Hover and focus only explain controls.</li>
        <li>Apply executes the reviewed action once. Cancel leaves the run unchanged.</li>
        <li>Worst road pressure is the busiest road, not a citywide average.</li>
      </ul></>}
      <p className="muted">Replay Tutorial starts a fresh practice session and replaces the current run after you confirm.</p>
      <div className="previewActions"><button onClick={closeHelp}>Return To Game</button><button onClick={showReplayConfirmation}>Replay Tutorial</button></div>
    </Modal>
    {help.confirmingReplay && <Modal title="Start a fresh practice session?" onDismiss={cancelReplayConfirmation}>
      <p>Replay Tutorial replaces the current run with the practice checkpoint. Your current simulation session will be reset.</p>
      <div className="previewActions"><button onClick={startPracticeFromHelp}>Start Practice</button><button onClick={cancelReplayConfirmation}>Keep Current Run</button></div>
    </Modal>}
  </>;
}
