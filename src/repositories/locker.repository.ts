import { Op, type WhereOptions } from 'sequelize';
import { sequelize } from '../configs/database.ts';
import { LockerEvent } from '../models/locker-event.model.ts';
import { Locker } from '../models/locker.model.ts';
import type { LockerStatus, SizeCategory } from '../types/locker.ts';

export interface LockerRepository {
  create(input: { identifier: string; size: SizeCategory }): Promise<Locker>;
  list(input: {
    page: number;
    limit: number;
    status?: LockerStatus;
    search?: string;
  }): Promise<{ rows: Locker[]; count: number }>;
  listEvents(input: {
    lockerId: number;
    page: number;
    limit: number;
  }): Promise<{ rows: LockerEvent[]; count: number } | null>;
  findAvailable(sizes: readonly SizeCategory[]): Promise<Locker | null>;
  /**
   * @returns The assigned locker, or null if another request claimed it first.
   */
  assignPackage(
    locker: Locker,
    packageIdentifier: string,
    pickupCode: string,
    occupiedAt: Date,
  ): Promise<Locker | null>;
  retrievePackage<T>(
    lockerIdentifier: string,
    pickupCode: string,
    decide: (assignment: RetrievalAssignment) => RetrievalDecision<T>,
  ): Promise<T | null>;
}

export interface RetrievalAssignment {
  packageIdentifier: string;
  lastOccupiedAt: Date | null;
}

export interface RetrievalDecision<T> {
  result: T;
  release: boolean;
  chargesInCents: number;
}

export class SequelizeLockerRepository implements LockerRepository {
  create(input: { identifier: string; size: SizeCategory }) {
    return Locker.create({
      identifier: input.identifier,
      size: input.size,
      packageIdentifier: null,
      pickupCode: null,
      lastOccupiedAt: null,
    });
  }

  list(input: {
    page: number;
    limit: number;
    status?: LockerStatus;
    search?: string;
  }) {
    const where: WhereOptions = {};
    if (input.status) where.status = input.status;
    if (input.search) where.identifier = { [Op.like]: `%${input.search}%` };

    return Locker.findAndCountAll({
      attributes: [
        'id',
        'identifier',
        'size',
        'status',
        'pickupCode',
        'packageIdentifier',
      ],
      where,
      order: [['identifier', 'ASC']],
      limit: input.limit,
      offset: (input.page - 1) * input.limit,
    });
  }

  async listEvents(input: { lockerId: number; page: number; limit: number }) {
    const locker = await Locker.findByPk(input.lockerId, {
      attributes: ['id'],
    });
    if (!locker) return null;

    return LockerEvent.findAndCountAll({
      attributes: [
        'id',
        'eventType',
        'lockerStatus',
        'packageIdentifier',
        'chargesInCents',
        'createdAt',
      ],
      where: { lockerId: input.lockerId },
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: input.limit,
      offset: (input.page - 1) * input.limit,
    });
  }

  findAvailable(sizes: readonly SizeCategory[]) {
    return Locker.findOne({
      where: { status: 'available', size: { [Op.in]: sizes } },
      order: [
        ['size', 'ASC'],
        ['identifier', 'ASC'],
      ],
    });
  }

  assignPackage(
    locker: Locker,
    packageIdentifier: string,
    pickupCode: string,
    occupiedAt: Date,
  ) {
    return sequelize.transaction(async (transaction) => {
      const availableLocker = await Locker.findOne({
        where: { id: locker.id, status: 'available' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!availableLocker) return null;

      await availableLocker.update(
        {
          status: 'occupied',
          packageIdentifier,
          pickupCode,
          lastOccupiedAt: occupiedAt,
        },
        { transaction },
      );

      await LockerEvent.create(
        {
          lockerId: availableLocker.id,
          eventType: 'package_stored',
          lockerStatus: 'occupied',
          packageIdentifier,
          chargesInCents: null,
        },
        { transaction },
      );

      return availableLocker;
    });
  }

  retrievePackage<T>(
    lockerIdentifier: string,
    pickupCode: string,
    decide: (assignment: RetrievalAssignment) => RetrievalDecision<T>,
  ) {
    return sequelize.transaction(async (transaction) => {
      const locker = await Locker.findOne({
        where: {
          identifier: lockerIdentifier,
          pickupCode,
          status: 'occupied',
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!locker?.packageIdentifier) return null;

      const packageIdentifier = locker.packageIdentifier;
      const decision = decide({
        packageIdentifier,
        lastOccupiedAt: locker.lastOccupiedAt,
      });

      if (decision.release) {
        await locker.update(
          {
            status: 'available',
            packageIdentifier: null,
            pickupCode: null,
            lastOccupiedAt: null,
          },
          { transaction },
        );

        await LockerEvent.create(
          {
            lockerId: locker.id,
            eventType: 'package_retrieved',
            lockerStatus: 'available',
            packageIdentifier,
            chargesInCents: decision.chargesInCents,
          },
          { transaction },
        );
      }

      return decision.result;
    });
  }
}
