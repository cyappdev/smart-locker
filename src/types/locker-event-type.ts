export const LOCKER_EVENT_TYPES = [
  "package_stored",
  "package_retrieved",
  "status_changed",
] as const;

export type LockerEventType = (typeof LOCKER_EVENT_TYPES)[number];
