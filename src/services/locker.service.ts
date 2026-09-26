import { randomInt } from "node:crypto";
import { UniqueConstraintError } from "sequelize";
import { AppError } from "../errors/app-error.ts";
import {
  lockerRepository,
  type LockerRepositoryPort,
} from "../repositories/locker.repository.ts";
import type {
  CreateLockerInput,
  ListLockerEventsInput,
  ListLockersInput,
  RetrievePackageInput,
  StorePackageInput,
} from "../schemas/locker.schema.ts";
import type { SizeCategory } from "../types/size-category.ts";
import {
  TieredStorageFeePolicy,
  type StorageFeePolicy,
} from "./storage-fee-policy.ts";

const ELIGIBLE_LOCKER_SIZES: Record<SizeCategory, readonly SizeCategory[]> = {
  small: ["small", "medium", "large"],
  medium: ["medium", "large"],
  large: ["large"],
};

const PICKUP_CODE_ATTEMPTS = 5;

export interface RetrievePackageResult {
  status: "retrieved" | "charges_required";
  packageIdentifier: string;
  occupiedAt: string;
  calculatedAt: string;
  chargesInCents: number;
}

export type LockerServicePort = Pick<
  LockerService,
  "createLocker" | "listLockers" | "listLockerEvents" | "storePackage" | "retrievePackage"
>;

export class LockerService {
  private readonly repository: LockerRepositoryPort;
  private readonly generatePickupCode: () => string;
  private readonly now: () => Date;
  private readonly storageFeePolicy: StorageFeePolicy;

  constructor(
    repository: LockerRepositoryPort = lockerRepository,
    generatePickupCode: () => string = () =>
      randomInt(0, 1_000_000).toString().padStart(6, "0"),
    now: () => Date = () => new Date(),
    storageFeePolicy: StorageFeePolicy = new TieredStorageFeePolicy(),
  ) {
    this.repository = repository;
    this.generatePickupCode = generatePickupCode;
    this.now = now;
    this.storageFeePolicy = storageFeePolicy;
  }

  createLocker(input: CreateLockerInput) {
    return this.repository.create(input);
  }

  async listLockers(input: ListLockersInput) {
    const { rows, count } = await this.repository.list(input);

    return {
      data: rows.map(({ id, identifier, size, status, pickupCode, packageIdentifier }) => ({
        id,
        identifier,
        size,
        status,
        pickupCode,
        packageIdentifier,
      })),
      pagination: {
        page: input.page,
        limit: input.limit,
        total: count,
        totalPages: Math.ceil(count / input.limit),
      },
    };
  }

  async listLockerEvents(input: ListLockerEventsInput) {
    const result = await this.repository.listEvents(input);
    if (!result) {
      throw new AppError(404, "LOCKER_NOT_FOUND", "Locker not found.");
    }

    return {
      data: result.rows.map(({ id, eventType, lockerStatus, packageIdentifier, chargesInCents, createdAt }) => ({
        id,
        eventType,
        lockerStatus,
        packageIdentifier,
        chargesInCents,
        createdAt: createdAt.toISOString(),
      })),
      pagination: {
        page: input.page,
        limit: input.limit,
        total: result.count,
        totalPages: Math.ceil(result.count / input.limit),
      },
    };
  }

  async storePackage(input: StorePackageInput) {
    while (true) {
      const locker = await this.repository.findAvailable(
        ELIGIBLE_LOCKER_SIZES[input.size],
      );

      if (!locker) {
        throw new AppError(404, "LOCKER_NOT_FOUND", "No suitable locker found.");
      }

      let claimedByAnotherRequest = false;
      for (let attempt = 0; attempt < PICKUP_CODE_ATTEMPTS; attempt += 1) {
        const pickupCode = this.generatePickupCode();

        try {
          const updatedLocker = await this.repository.assignPackage(
            locker,
            input.packageIdentifier,
            pickupCode,
            this.now(),
          );

          if (!updatedLocker) {
            claimedByAnotherRequest = true;
            break;
          }

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

      if (!claimedByAnotherRequest) {
        throw new AppError(
          500,
          "PICKUP_CODE_GENERATION_FAILED",
          "A unique pickup code could not be generated.",
        );
      }
    }
  }

  async retrievePackage(input: RetrievePackageInput): Promise<RetrievePackageResult> {
    const result = await this.repository.retrievePackage(
      input.lockerIdentifier,
      input.pickupCode,
      ({ packageIdentifier, lastOccupiedAt }) => {
        const calculatedAt = this.now();
        if (!(lastOccupiedAt instanceof Date)) {
          throw new Error("Invalid storage timestamp.");
        }
        const chargesInCents = this.storageFeePolicy.calculate(lastOccupiedAt, calculatedAt);
        const release = chargesInCents === 0 || input.confirmCharges === true;

        return {
          release,
          chargesInCents,
          result: {
            status: release ? "retrieved" as const : "charges_required" as const,
            packageIdentifier,
            occupiedAt: lastOccupiedAt.toISOString(),
            calculatedAt: calculatedAt.toISOString(),
            chargesInCents,
          },
        };
      },
    );

    if (!result) {
      throw new AppError(
        404,
        "PACKAGE_NOT_FOUND",
        "No package found for the provided locker identifier and pickup code.",
      );
    }

    return result;
  }
}

export const lockerService = new LockerService();
