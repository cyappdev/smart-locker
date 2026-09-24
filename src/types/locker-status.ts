export const LOCKER_STATUSES = ["available", "inactive", "occupied"] as const;
export type LockerStatus = (typeof LOCKER_STATUSES)[number];
