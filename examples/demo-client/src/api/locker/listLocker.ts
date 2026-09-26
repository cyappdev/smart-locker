import { axiosInstance } from "..";
import type { LockerStatus } from "../../types/locker-status";
import type { SizeCategory } from "../../types/size-category";

export interface ListLockerRequest {
    search: string;
    page?: number;
    limit?: number;
}

export interface ListLockerResponse {
    data: Array<Locker>;
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export interface Locker {
    id: number;
    identifier: string;
    size: SizeCategory;
    status: LockerStatus;
    packageIdentifier: string | null;
    pickupCode: string | null;
}

export const listLocker = async (request: ListLockerRequest): Promise<ListLockerResponse> => {
    const response = await axiosInstance.get<ListLockerResponse>("/api/lockers", {
        params: request,
    });

    return response.data;
};
