import { randomInt } from 'node:crypto';
import { UniqueConstraintError } from 'sequelize';
import { AppError } from '../errors/app-error.ts';
import type { Locker } from '../models/locker.model.ts';
import type { LockerRepository } from '../repositories/locker.repository.ts';
import type {
  CreateLockerBody,
  ListLockerEventsInput,
  ListLockersQuery,
  RetrievePackageBody,
  StorePackageBody,
} from '../schemas/locker.schema.ts';
import type { SizeCategory } from '../types/locker.ts';
import type {
  CreateLockerResponse,
  ListLockerEventsResponse,
  ListLockersResponse,
  RetrievePackageResponse,
  StorePackageResponse,
} from '../types/locker-response.ts';
import {
  createStorageFeePolicy,
  type StorageFeePolicy,
} from './storage-fee-policy.ts';

const ELIGIBLE_LOCKER_SIZES: Record<SizeCategory, readonly SizeCategory[]> = {
  small: ['small', 'medium', 'large'],
  medium: ['medium', 'large'],
  large: ['large'],
};

const PICKUP_CODE_ATTEMPTS = 5;

export class LockerService {
  private readonly repository: LockerRepository;
  private readonly generatePickupCode: () => string;
  private readonly now: () => Date;
  private readonly storageFeePolicy: StorageFeePolicy;

  constructor(
    repository: LockerRepository,
    generatePickupCode: () => string = () =>
      randomInt(0, 1_000_000).toString().padStart(6, '0'),
    now: () => Date = () => new Date(),
    storageFeePolicy: StorageFeePolicy = createStorageFeePolicy('tiered'),
  ) {
    this.repository = repository;
    this.generatePickupCode = generatePickupCode;
    this.now = now;
    this.storageFeePolicy = storageFeePolicy;
  }

  async createLocker(input: CreateLockerBody): Promise<CreateLockerResponse> {
    try {
      const { id, identifier, size, status } =
        await this.repository.create(input);
      return { id, identifier, size, status };
    } catch (error) {
      if (
        error instanceof UniqueConstraintError &&
        Object.hasOwn(error.fields, 'identifier')
      ) {
        throw new AppError(
          409,
          'LOCKER_IDENTIFIER_EXISTS',
          'A locker with the same identifier already exists.',
        );
      }
      throw error;
    }
  }

  async listLockers(input: ListLockersQuery): Promise<ListLockersResponse> {
    const { rows, count } = await this.repository.list(input);

    return {
      data: rows.map(
        ({ id, identifier, size, status, pickupCode, packageIdentifier }) => ({
          id,
          identifier,
          size,
          status,
          pickupCode,
          packageIdentifier,
        }),
      ),
      pagination: {
        page: input.page,
        limit: input.limit,
        total: count,
        totalPages: Math.ceil(count / input.limit),
      },
    };
  }

  async listLockerEvents(
    input: ListLockerEventsInput,
  ): Promise<ListLockerEventsResponse> {
    const result = await this.repository.listEvents(input);
    if (!result) {
      throw new AppError(404, 'LOCKER_NOT_FOUND', 'Locker not found.');
    }

    return {
      data: result.rows.map(
        ({
          id,
          eventType,
          lockerStatus,
          packageIdentifier,
          chargesInCents,
          createdAt,
        }) => ({
          id,
          eventType,
          lockerStatus,
          packageIdentifier,
          chargesInCents,
          createdAt: createdAt.toISOString(),
        }),
      ),
      pagination: {
        page: input.page,
        limit: input.limit,
        total: result.count,
        totalPages: Math.ceil(result.count / input.limit),
      },
    };
  }

  async storePackage(input: StorePackageBody): Promise<StorePackageResponse> {
    let assignedLocker: Locker | null;

    do {
      const locker = await this.repository.findAvailable(
        ELIGIBLE_LOCKER_SIZES[input.size],
      );
      if (!locker) {
        throw new AppError(
          404,
          'NO_AVAILABLE_LOCKER',
          'No suitable locker found.',
        );
      }

      assignedLocker = await this.assignWithUniquePickupCode(
        locker,
        input.packageIdentifier,
      );
    } while (!assignedLocker); // Another request claimed this locker first, search again.

    return {
      lockerId: assignedLocker.id,
      identifier: assignedLocker.identifier,
      packageIdentifier: input.packageIdentifier,
      pickupCode: assignedLocker.pickupCode!,
      status: 'occupied',
    };
  }

  private async assignWithUniquePickupCode(
    locker: Locker,
    packageIdentifier: string,
  ): Promise<Locker | null> {
    for (let attempt = 0; attempt < PICKUP_CODE_ATTEMPTS; attempt += 1) {
      try {
        return await this.repository.assignPackage(
          locker,
          packageIdentifier,
          this.generatePickupCode(),
          this.now(),
        );
      } catch (error) {
        if (
          !(error instanceof UniqueConstraintError) ||
          !Object.hasOwn(error.fields, 'pickup_code')
        ) {
          throw error;
        }
      }
    }

    throw new AppError(
      500,
      'PICKUP_CODE_GENERATION_FAILED',
      'A unique pickup code could not be generated.',
    );
  }

  async retrievePackage(
    input: RetrievePackageBody,
  ): Promise<RetrievePackageResponse> {
    const result = await this.repository.retrievePackage(
      input.lockerIdentifier,
      input.pickupCode,
      ({ packageIdentifier, lastOccupiedAt }) => {
        const calculatedAt = this.now();
        if (!(lastOccupiedAt instanceof Date)) {
          throw new Error('Invalid storage timestamp.');
        }
        const chargesInCents = this.storageFeePolicy.calculate(
          lastOccupiedAt,
          calculatedAt,
        );
        const release = chargesInCents === 0 || input.confirmCharges === true;

        return {
          release,
          chargesInCents,
          result: {
            status: release
              ? ('retrieved' as const)
              : ('charges_required' as const),
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
        'PACKAGE_NOT_FOUND',
        'No package found for the provided locker identifier and pickup code.',
      );
    }

    return result;
  }
}
