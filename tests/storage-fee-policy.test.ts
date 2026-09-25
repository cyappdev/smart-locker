import { describe, expect, it } from "vitest";
import { TieredStorageFeePolicy } from "../src/services/storage-fee-policy.ts";

describe("TieredStorageFeePolicy", () => {
  const policy = new TieredStorageFeePolicy();
  const occupiedAt = new Date("2024-06-01T12:00:00.000Z");

  it.each([
    [0, 0],
    [24 * 60 * 60 * 1000 - 1, 0],
    [24 * 60 * 60 * 1000, 100],
    [5 * 24 * 60 * 60 * 1000, 500],
    [143 * 60 * 60 * 1000, 500],
    [6 * 24 * 60 * 60 * 1000, 700],
    [10 * 24 * 60 * 60 * 1000, 1500],
    [11 * 24 * 60 * 60 * 1000, 1800],
  ])("charges %i cents of elapsed time as %i cents", (elapsed, charge) => {
    expect(policy.calculate(occupiedAt, new Date(occupiedAt.getTime() + elapsed))).toBe(charge);
  });
});
