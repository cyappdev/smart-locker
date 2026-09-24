import { Op, type WhereOptions } from "sequelize";
import { sequelize } from "../configs/database.ts";
import { Locker } from "../models/locker.model.ts";
import type {
  CreateLockerInput,
  ListLockersInput,
} from "../schemas/locker.schema.ts";
import type { SizeCategory } from "../types/size-category.ts";

export interface LockerRepositoryPort {
  create(input: CreateLockerInput): Promise<Locker>;
  list(input: ListLockersInput): Promise<{ rows: Locker[]; count: number }>;
  findAvailable(sizes: readonly SizeCategory[]): Promise<Locker | null>;
  assignPackage(
    locker: Locker,
    packageIdentifier: string,
    pickupCode: string,
    occupiedAt: Date,
  ): Promise<Locker>;
  retrievePackage(
    lockerIdentifier: string,
    pickupCode: string,
  ): Promise<string | null>;
}

export class LockerRepository implements LockerRepositoryPort {
  create(input: CreateLockerInput) {
    return Locker.create({
      identifier: input.identifier,
      size: input.size,
      packageIdentifier: null,
      pickupCode: null,
      lastOccupiedAt: null,
    });
  }

  list(input: ListLockersInput) {
    const where: WhereOptions = {};
    if (input.status) where.status = input.status;
    if (input.search) where.identifier = { [Op.like]: `%${input.search}%` };

    return Locker.findAndCountAll({
      attributes: [
        "id",
        "identifier",
        "size",
        "status",
        "pickupCode",
        "packageIdentifier",
      ],
      where,
      order: [["identifier", "ASC"]],
      limit: input.limit,
      offset: (input.page - 1) * input.limit,
    });
  }

  findAvailable(sizes: readonly SizeCategory[]) {
    return Locker.findOne({
      where: { status: "available", size: { [Op.in]: sizes } },
      order: [
        ["size", "ASC"],
        ["identifier", "ASC"],
      ],
    });
  }

  assignPackage(
    locker: Locker,
    packageIdentifier: string,
    pickupCode: string,
    occupiedAt: Date,
  ) {
    return locker.update({
      status: "occupied",
      packageIdentifier,
      pickupCode,
      lastOccupiedAt: occupiedAt,
    });
  }

  retrievePackage(lockerIdentifier: string, pickupCode: string) {
    return sequelize.transaction(async (transaction) => {
      const locker = await Locker.findOne({
        where: {
          identifier: lockerIdentifier,
          pickupCode,
          status: "occupied",
          packageIdentifier: { [Op.ne]: null },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!locker?.packageIdentifier) return null;

      const packageIdentifier = locker.packageIdentifier;
      await locker.update(
        {
          status: "available",
          packageIdentifier: null,
          pickupCode: null,
          lastOccupiedAt: null,
        },
        { transaction },
      );

      return packageIdentifier;
    });
  }
}

export const lockerRepository = new LockerRepository();
