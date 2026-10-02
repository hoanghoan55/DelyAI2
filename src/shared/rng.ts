export class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Inclusive integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('SeededRandom.pick: empty array')
    return arr[this.int(0, arr.length - 1)]!
  }
}

export function createSeededRandom(seed: number): SeededRandom {
  return new SeededRandom(seed)
}
