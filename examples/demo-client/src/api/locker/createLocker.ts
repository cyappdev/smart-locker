import { axiosInstance } from "..";
import type { LockerStatus } from "../../types/locker-status";
import type { SizeCategory } from "../../types/size-category";

export interface CreateLockerRequest {
    identifier: string;
    size: SizeCategory;
}

export interface CreateLockerResponse extends CreateLockerRequest {
    id: number;
    status: LockerStatus;
}

export const createLocker = async (request: CreateLockerRequest): Promise<CreateLockerResponse> => {
    const response = await axiosInstance.post<CreateLockerResponse>("/api/lockers", request);
    return response.data;
};
