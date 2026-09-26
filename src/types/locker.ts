export const SIZE_CATEGORIES = ["small", "medium", "large"] as const;
export type SizeCategory = (typeof SIZE_CATEGORIES)[number];

export const LOCKER_STATUSES = ["available", "occupied"] as const;
export type LockerStatus = (typeof LOCKER_STATUSES)[number];

export const LOCKER_EVENT_TYPES = [
  "package_stored",
  "package_retrieved",
  "status_changed",
] as const;
export type LockerEventType = (typeof LOCKER_EVENT_TYPES)[number];
