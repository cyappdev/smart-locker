import { axiosInstance } from "..";
import type { SizeCategory } from "../../types/size-category";

export interface StorePackageRequest {
    packageIdentifier: string;
    size: SizeCategory;
}

export interface StorePackageResponse {
    lockerId: number;
    identifier: string;
    packageIdentifier: string;
    pickupCode: string;
    status: "occupied";
}

export const storePackage = async (request: StorePackageRequest): Promise<StorePackageResponse> => {
    const response = await axiosInstance.post<StorePackageResponse>("/api/lockers/store", request);
    return response.data;
};
