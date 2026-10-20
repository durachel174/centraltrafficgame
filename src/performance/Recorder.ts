export interface Distribution { count: number; median: number | null; p95: number | null; maximum: number | null; }
export function distribution(values: number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : null;
  return { count: sorted.length, median: sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : null, p95: percentile(0.95), maximum: sorted.at(-1) ?? null };
}

export class PerformanceRecorder {
  private buffers = new Map<string, number[]>();
  private counts = new Map<string, number>();
  recording = false;
  started = 0;
  label = "";
  constructor(readonly capacity = 4096) {}
  start(label: string, now: number) { this.buffers.clear(); this.counts.clear(); this.label = label; this.started = now; this.recording = true; }
  record = (name: string, milliseconds: number) => {
    if (!this.recording || !Number.isFinite(milliseconds) || milliseconds < 0) return;
    const buffer = this.buffers.get(name) ?? [];
    const count = this.counts.get(name) ?? 0;
    buffer[count % this.capacity] = milliseconds;
    this.buffers.set(name, buffer); this.counts.set(name, count + 1);
  };
  report(now: number) {
    return { workload: this.label, durationMs: now - this.started, capacityPerMetric: this.capacity,
      metrics: Object.fromEntries([...this.buffers].map(([name, samples]) => [name, { ...distribution(samples), totalSeen: this.counts.get(name) }])) };
  }
}

export const browserPerformance = new PerformanceRecorder();
// This module never changes engine state and records nothing unless explicitly started.
export const recordBrowserTiming = import.meta.env.DEV ? browserPerformance.record : undefined;
