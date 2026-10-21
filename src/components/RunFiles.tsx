import { Modal } from "./Modal";
import { useEffect, useId, useRef, useState } from "react";
import { useGameStore } from "../game/GameStore";

export function RunFiles() {
  const { completedRun, replay, pendingImport, importError, importRun, cancelImport, startReplay, tutorial, preview } = useGameStore();
  const id = useId();
  const readToken = useRef(0);
  useEffect(() => { readToken.current++; setReadError(null); }, [preview.baseSessionId]);
  const [readError, setReadError] = useState<string | null>(null);
  if (tutorial.active) return null;
  const exportRun = () => {
    if (!completedRun || (replay && replay.verification !== "verified")) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(completedRun, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `central-traffic-${completedRun.seed}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="runFiles">
    {completedRun && <button onClick={exportRun} disabled={!!replay && replay.verification !== "verified"}>Export Completed Run JSON</button>}
    <label htmlFor={id}>Import Monday Morning run (local JSON)</label>
    <input id={id} type="file" accept=".json,application/json" onChange={async event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (!file) return;
      const token = ++readToken.current;
      const session = preview.baseSessionId;
      setReadError(null);
      try {
        if (file.size > 2_000_000) throw new Error("Run file exceeds the 2 MB limit.");
        const text = await file.text();
        if (token !== readToken.current || session !== useGameStore.getState().preview.baseSessionId) return;
        importRun(text);
      } catch (error) { if (token !== readToken.current || session !== useGameStore.getState().preview.baseSessionId) return; cancelImport(); setReadError(error instanceof Error ? error.message : String(error)); }
    }} />
    {(readError || importError) && <p role="alert">{readError ?? importError}</p>}
    {pendingImport && <Modal title="Start imported replay?" onDismiss={cancelImport}>
      <strong>Compatible run · seed {pendingImport.seed} · {pendingImport.actions.length} decisions</strong>
      <p>Start this replay from 7:00? This replaces the current session. Cutoff metrics, final evaluation and state will be verified when clearance finishes.</p>
      <div className="previewActions"><button onClick={() => startReplay(pendingImport)}>Start Imported Replay</button><button onClick={cancelImport}>Keep Current Run</button></div>
    </Modal>}
    <p className="muted">Files stay on this device. Imports never start automatically.</p>
  </div>;
}
