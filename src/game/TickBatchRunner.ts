/** Runs the live store's ticks in bounded batches. No cloned/diagnostic engine.
 * Cancellation stops scheduling only; all completed ticks remain authoritative. */
export function runTickBatches(advance: () => void, keepGoing: () => boolean, finished: () => void) {
  let canceled = false, timer: ReturnType<typeof setTimeout>;
  const batch = () => {
    if (canceled) return;
    const start = performance.now();
    for (let count = 0; count < 8 && performance.now() - start < 8 && keepGoing(); count++) advance();
    if (!keepGoing()) { finished(); return; }
    timer = setTimeout(batch, 0);
  };
  timer = setTimeout(batch, 0);
  return () => { canceled = true; clearTimeout(timer); };
}
