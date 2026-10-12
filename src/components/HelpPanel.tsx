import { HelpCircle } from "lucide-react";
import { useGameStore } from "../game/GameStore";

export function HelpPanel() {
  const { help, closeHelp, showReplayConfirmation, cancelReplayConfirmation, startPracticeFromHelp } = useGameStore();
  if (!help.open) return null;

  return (
    <div className="modalBackdrop" role="presentation">
      <section className="helpPanel" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="helpTitle">
          <HelpCircle size={18} />
          <h2 id="help-title">How To Play</h2>
        </div>
        <p>Keep the morning commute moving by watching forecasts, previewing actions, and confirming only the tradeoffs you want.</p>
        <ul>
          <li>Select a road to inspect current traffic and forecast pressure.</li>
          <li>Preview reroutes or holds before applying them.</li>
          <li>Confirm applies the reviewed action once. Cancel leaves the run unchanged.</li>
          <li>Worst road pressure is the busiest road, not a citywide average.</li>
        </ul>
        {help.confirmingReplay ? (
          <div className="confirmBox">
            <strong>Start a fresh practice session?</strong>
            <p>Replay Tutorial replaces the current run with the practice checkpoint. Your current simulation session will be reset.</p>
            <div className="previewActions">
              <button onClick={startPracticeFromHelp}>Start Practice</button>
              <button onClick={cancelReplayConfirmation}>Keep Current Run</button>
            </div>
          </div>
        ) : (
          <p className="muted">Replay Tutorial starts a fresh practice session and replaces the current run after you confirm.</p>
        )}
        <div className="previewActions">
          <button onClick={closeHelp}>Return To Game</button>
          <button onClick={showReplayConfirmation}>Replay Tutorial</button>
        </div>
      </section>
    </div>
  );
}
