export class SeededRandom {
  private state = 1;

  constructor(seed = 1) {
    this.reset(seed);
  }

  reset(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  getState(): number {
    return this.state;
  }

  setState(state: number) {
    this.state = state >>> 0 || 1;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pickWeighted<T>(items: Array<{ item: T; weight: number }>): T {
    const total = items.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = this.next() * total;
    for (const entry of items) {
      roll -= entry.weight;
      if (roll <= 0) return entry.item;
    }
    return items[items.length - 1].item;
  }
}
