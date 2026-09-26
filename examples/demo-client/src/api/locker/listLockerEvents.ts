import { axiosInstance } from '..';
import type { LockerStatus } from '../../types/locker-status';

export interface ListLockerEventsResponse {
  data: Array<{
    id: number;
    eventType: string;
    lockerStatus: LockerStatus;
    packageIdentifier: string | null;
    chargesInCents: number | null;
    createdAt: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const listLockerEvents = async (
  lockerId: number,
  page: number,
  limit: number,
): Promise<ListLockerEventsResponse> => {
  const response = await axiosInstance.get<ListLockerEventsResponse>(
    `/api/lockers/${lockerId}/events`,
    {
      params: { page, limit },
    },
  );
  return response.data;
};
