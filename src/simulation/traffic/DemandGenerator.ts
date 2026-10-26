import { SeededRandom } from "../core/SeededRandom";
import type { DemandConfig, TripRequest } from "../types";

export class DemandGenerator {
  private carry = 0;
  private nextId = 1;

  constructor(
    private config: DemandConfig,
    private rng: SeededRandom
  ) {}

  reset() {
    this.carry = 0;
    this.nextId = 1;
  }

  getState() {
    return { carry: this.carry, nextId: this.nextId };
  }

  setState(state: { carry: number; nextId: number }) {
    this.carry = state.carry;
    this.nextId = state.nextId;
  }

  getRate(relativeMinute: number): number {
    return this.rate(relativeMinute);
  }

  generate(relativeMinute: number, dtMinutes: number): TripRequest[] {
    const rate = this.rate(relativeMinute);
    this.carry += rate * dtMinutes;
    const count = Math.floor(this.carry);
    this.carry -= count;
    const trips: TripRequest[] = [];
    for (let i = 0; i < count; i++) {
      const pair = this.rng.pickWeighted(this.config.pairs.map((item) => ({ item, weight: item.weight })));
      const [minTolerance, maxTolerance] = this.config.passengerTolerance;
      trips.push({
        id: `trip_${this.nextId++}`,
        origin: pair.origin,
        destination: pair.destination,
        requestedDepartureTime: relativeMinute,
        passengerTolerance: minTolerance + this.rng.next() * (maxTolerance - minTolerance)
      });
    }
    for (const batch of this.config.batches ?? []) {
      if (batch.at < relativeMinute - dtMinutes || batch.at >= relativeMinute) continue;
      const [min, max] = this.config.passengerTolerance;
      for (let i = 0; i < batch.size; i++) trips.push({
        id: `trip_${this.nextId++}`, groupId: batch.id, origin: batch.origin, destination: batch.destination,
        requestedDepartureTime: relativeMinute, availableAt: relativeMinute + batch.decisionMinutes,
        passengerTolerance: min + this.rng.next() * (max - min)
      });
    }
    return trips;
  }

  private rate(relativeMinute: number): number {
    const points = this.config.curve;
    if (relativeMinute <= points[0].minute) return points[0].tripsPerMinute;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const next = points[i];
      if (relativeMinute <= next.minute) {
        const t = (relativeMinute - prev.minute) / (next.minute - prev.minute);
        return prev.tripsPerMinute + (next.tripsPerMinute - prev.tripsPerMinute) * t;
      }
    }
    return points[points.length - 1].tripsPerMinute;
  }
}
