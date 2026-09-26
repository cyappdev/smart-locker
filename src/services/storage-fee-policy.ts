const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
// X in the tiered rule: X per day for days 1-5, 2X for days 6-10, 3X after that.
const DAILY_RATE_IN_CENTS = 100;

export interface StorageFeePolicy {
  calculate(occupiedAt: Date, calculatedAt: Date): number;
}

export function createStorageFeePolicy(type: 'tiered'): StorageFeePolicy {
  switch (type) {
    case 'tiered':
      return new TieredStorageFeePolicy();
  }
}

export class TieredStorageFeePolicy implements StorageFeePolicy {
  calculate(occupiedAt: Date, calculatedAt: Date): number {
    const elapsed = calculatedAt.getTime() - occupiedAt.getTime();
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      throw new Error('Invalid storage timestamp.');
    }

    const days = Math.floor(elapsed / MILLISECONDS_PER_DAY);
    return (
      Math.min(days, 5) * DAILY_RATE_IN_CENTS +
      Math.min(Math.max(days - 5, 0), 5) * 2 * DAILY_RATE_IN_CENTS +
      Math.max(days - 10, 0) * 3 * DAILY_RATE_IN_CENTS
    );
  }
}
