export const LOCKER_STATUSES = ['available', 'occupied'] as const;
export type LockerStatus = (typeof LOCKER_STATUSES)[number];
