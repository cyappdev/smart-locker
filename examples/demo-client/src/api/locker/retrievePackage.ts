import { axiosInstance } from '..';

export interface RetrievePackageRequest {
  lockerIdentifier: string;
  pickupCode: string;
  confirmCharges?: boolean;
}

export interface RetrievePackageResponse {
  status: 'retrieved' | 'charges_required';
  packageIdentifier: string;
  occupiedAt: string;
  calculatedAt: string;
  chargesInCents: number;
}

export const retrievePackage = async (
  request: RetrievePackageRequest,
): Promise<RetrievePackageResponse> => {
  const response = await axiosInstance.post<RetrievePackageResponse>(
    '/api/lockers/retrieve',
    request,
  );
  return response.data;
};
