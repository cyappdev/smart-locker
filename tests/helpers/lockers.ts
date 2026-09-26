import { Locker } from "./mysql.ts";

export const createAssignment = async (
  overrides: { pickupCode?: string; lastOccupiedAt?: Date } = {},
) => Locker.create({
  identifier: `test-${crypto.randomUUID()}`,
  size: "small",
  status: "occupied",
  packageIdentifier: "ORDER-123",
  pickupCode: crypto.randomUUID(),
  lastOccupiedAt: new Date("2024-06-01T12:00:00.000Z"),
  ...overrides,
});

export const createAvailableLocker = async (size: "small" | "medium" | "large") => Locker.create({
  identifier: `test-${crypto.randomUUID()}`,
  size,
  status: "available",
  packageIdentifier: null,
  pickupCode: null,
  lastOccupiedAt: null,
});
