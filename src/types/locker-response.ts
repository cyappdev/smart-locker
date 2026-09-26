import type { LockerEventType, LockerStatus, SizeCategory } from './locker.ts';

interface Paginated<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateLockerResponse {
  id: number;
  identifier: string;
  size: SizeCategory;
  status: LockerStatus;
}

export type ListLockersResponse = Paginated<{
  id: number;
  identifier: string;
  size: SizeCategory;
  status: LockerStatus;
  pickupCode: string | null;
  packageIdentifier: string | null;
}>;

export type ListLockerEventsResponse = Paginated<{
  id: number;
  eventType: LockerEventType;
  lockerStatus: LockerStatus;
  packageIdentifier: string | null;
  chargesInCents: number | null;
  createdAt: string;
}>;

export interface StorePackageResponse {
  lockerId: number;
  identifier: string;
  packageIdentifier: string;
  pickupCode: string;
  status: 'occupied';
}

export interface RetrievePackageResponse {
  status: 'retrieved' | 'charges_required';
  packageIdentifier: string;
  occupiedAt: string;
  calculatedAt: string;
  chargesInCents: number;
}
