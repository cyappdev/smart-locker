import { randomInt } from "node:crypto";
import { UniqueConstraintError } from "sequelize";
import { AppError } from "../errors/app-error.ts";
import {
  lockerRepository,
  type LockerRepositoryPort,
} from "../repositories/locker.repository.ts";
import type {
  CreateLockerInput,
  ListLockersInput,
  RetrievePackageInput,
  StorePackageInput,
} from "../schemas/locker.schema.ts";
import type { SizeCategory } from "../types/size-category.ts";
import type { LockerStatus } from "../types/locker-status.ts";

const ELIGIBLE_LOCKER_SIZES: Record<SizeCategory, readonly SizeCategory[]> = {
  small: ["small", "medium", "large"],
  medium: ["medium", "large"],
  large: ["large"],
};

const PICKUP_CODE_ATTEMPTS = 5;

export interface LockerServicePort {
  createLocker(
    input: CreateLockerInput,
  ): ReturnType<LockerRepositoryPort["create"]>;
  listLockers(input: ListLockersInput): Promise<{
    data: Array<{
      id: number;
      identifier: string;
      size: SizeCategory;
      status: LockerStatus;
      packageIdentifier: string;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>;
  storePackage(input: StorePackageInput): Promise<{
    lockerId: number;
    identifier: string;
    packageIdentifier: string;
    pickupCode: string;
    status: "occupied";
  }>;
  retrievePackage(input: RetrievePackageInput): Promise<{
    success: true;
    packageIdentifier: string;
  }>;
}

export class LockerService implements LockerServicePort {
  private readonly repository: LockerRepositoryPort;
  private readonly generatePickupCode: () => string;

  constructor(
    repository: LockerRepositoryPort = lockerRepository,
    generatePickupCode: () => string = () =>
      randomInt(0, 1_000_000).toString().padStart(6, "0"),
  ) {
    this.repository = repository;
    this.generatePickupCode = generatePickupCode;
  }

  createLocker(input: CreateLockerInput) {
    return this.repository.create(input);
  }

  async listLockers(input: ListLockersInput) {
    const { rows, count } = await this.repository.list(input);

    // as any for testing pickup code
    return {
      data: rows.map(
        ({ id, identifier, size, status, pickupCode, packageIdentifier }) =>
          ({
            id,
            identifier,
            size,
            status,
            pickupCode,
            packageIdentifier,
          }) as any,
      ),
      pagination: {
        page: input.page,
        limit: input.limit,
        total: count,
        totalPages: Math.ceil(count / input.limit),
      },
    };
  }

  async storePackage(input: StorePackageInput) {
    const locker = await this.repository.findAvailable(
      ELIGIBLE_LOCKER_SIZES[input.size],
    );

    if (!locker) {
      throw new AppError(404, "LOCKER_NOT_FOUND", "No suitable locker found.");
    }

    for (let attempt = 0; attempt < PICKUP_CODE_ATTEMPTS; attempt += 1) {
      const pickupCode = this.generatePickupCode();

      try {
        const updatedLocker = await this.repository.assignPackage(
          locker,
          input.packageIdentifier,
          pickupCode,
          new Date(),
        );

        return {
          lockerId: updatedLocker.id,
          identifier: updatedLocker.identifier,
          packageIdentifier: updatedLocker.packageIdentifier!,
          pickupCode: updatedLocker.pickupCode!,
          status: "occupied" as const,
        };
      } catch (error) {
        if (!(error instanceof UniqueConstraintError)) throw error;
      }
    }

    throw new AppError(
      500,
      "PICKUP_CODE_GENERATION_FAILED",
      "A unique pickup code could not be generated.",
    );
  }

  async retrievePackage(input: RetrievePackageInput) {
    const packageIdentifier = await this.repository.retrievePackage(
      input.lockerIdentifier,
      input.pickupCode,
    );

    if (!packageIdentifier) {
      throw new AppError(
        404,
        "PACKAGE_NOT_FOUND",
        "No package found for the provided locker identifier and pickup code.",
      );
    }

    return { success: true as const, packageIdentifier };
  }
}

export const lockerService = new LockerService();
