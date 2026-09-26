import { describe, expect, it } from "vitest";
import { createStorageFeePolicy } from "../../src/services/storage-fee-policy.ts";

describe("TieredStorageFeePolicy", () => {
  const policy = createStorageFeePolicy("tiered");
  const occupiedAt = new Date("2024-06-01T12:00:00.000Z");
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;
  const justBeforeOneDay = oneDay - 1;
  const fiveDays = 5 * oneDay;
  const fiveDays23Hours = fiveDays + 23 * oneHour;
  const sixDays = 6 * oneDay;
  const tenDays = 10 * oneDay;
  const elevenDays = 11 * oneDay;

  it.each([
    [0, 0],
    [justBeforeOneDay, 0],
    [oneDay, 100],
    [fiveDays, 500],
    [fiveDays23Hours, 500],
    [sixDays, 700],
    [tenDays, 1500],
    [elevenDays, 1800],
  ])("charges %i milliseconds of storage as %i cents", (elapsed, charge) => {
    expect(policy.calculate(occupiedAt, new Date(occupiedAt.getTime() + elapsed))).toBe(charge);
  });
});
