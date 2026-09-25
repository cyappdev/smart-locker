const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface StorageFeePolicy {
  calculate(occupiedAt: Date, calculatedAt: Date): number;
}

export class TieredStorageFeePolicy implements StorageFeePolicy {
  calculate(occupiedAt: Date, calculatedAt: Date): number {
    const elapsed = calculatedAt.getTime() - occupiedAt.getTime();
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      throw new Error("Invalid storage timestamp.");
    }

    const days = Math.floor(elapsed / MILLISECONDS_PER_DAY);
    return (
      Math.min(days, 5) * 100 +
      Math.min(Math.max(days - 5, 0), 5) * 200 +
      Math.max(days - 10, 0) * 300
    );
  }
}
