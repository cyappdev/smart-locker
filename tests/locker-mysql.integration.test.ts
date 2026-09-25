import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_MYSQL_INTEGRATION === "1";
const databaseName = process.env.TEST_DB_NAME;

describe.skipIf(!enabled)("MySQL retrieval integration", () => {
  let sequelize: typeof import("../src/configs/database.ts").sequelize;
  let Locker: typeof import("../src/models/locker.model.ts").Locker;
  let LockerService: typeof import("../src/services/locker.service.ts").LockerService;
  let LockerRepository: typeof import("../src/repositories/locker.repository.ts").LockerRepository;
  const createdIds: number[] = [];

  beforeAll(async () => {
    if (!databaseName?.startsWith("splms_test")) {
      throw new Error("TEST_DB_NAME must start with splms_test for integration tests.");
    }
    process.env.DB_HOST = process.env.TEST_DB_HOST ?? "127.0.0.1";
    process.env.DB_PORT = process.env.TEST_DB_PORT ?? "3306";
    process.env.DB_NAME = databaseName;
    process.env.DB_USER = process.env.TEST_DB_USER;
    process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD;

    ({ sequelize } = await import("../src/configs/database.ts"));
    ({ Locker } = await import("../src/models/locker.model.ts"));
    ({ LockerService } = await import("../src/services/locker.service.ts"));
    ({ LockerRepository } = await import("../src/repositories/locker.repository.ts"));
    await sequelize.authenticate();
    await sequelize.sync();
  });

  afterAll(async () => {
    if (Locker && createdIds.length) await Locker.destroy({ where: { id: createdIds } });
    if (sequelize) await sequelize.close();
  });

  const createAssignment = async (occupiedAt: Date) => {
    const locker = await Locker.create({
      identifier: `test-${crypto.randomUUID()}`,
      size: "small",
      status: "occupied",
      packageIdentifier: "ORDER-123",
      pickupCode: Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0"),
      lastOccupiedAt: occupiedAt,
    });
    createdIds.push(locker.id);
    return locker;
  };

  it("persists a preview unchanged and releases after confirmation", async () => {
    const occupiedAt = new Date("2024-06-01T12:00:00.000Z");
    const locker = await createAssignment(occupiedAt);
    const service = new LockerService(new LockerRepository(), undefined, () => new Date("2024-06-02T12:00:00.000Z"));
    const input = { lockerIdentifier: locker.identifier, pickupCode: locker.pickupCode! };

    const wrongCode = `${(Number(input.pickupCode[0]) + 1) % 10}${input.pickupCode.slice(1)}`;
    await expect(service.retrievePackage({ ...input, pickupCode: wrongCode })).rejects.toMatchObject({ code: "PACKAGE_NOT_FOUND" });
    await expect(service.retrievePackage({ ...input, lockerIdentifier: "missing-locker" })).rejects.toMatchObject({ code: "PACKAGE_NOT_FOUND" });

    expect(await service.retrievePackage(input)).toMatchObject({ status: "charges_required", chargesInCents: 100 });
    await locker.reload();
    expect(locker).toMatchObject({
      status: "occupied", packageIdentifier: "ORDER-123", pickupCode: input.pickupCode,
    });
    expect(locker.lastOccupiedAt?.toISOString()).toBe(occupiedAt.toISOString());

    expect(await service.retrievePackage({ ...input, confirmCharges: true })).toMatchObject({
      status: "retrieved", packageIdentifier: "ORDER-123", chargesInCents: 100,
    });
    await locker.reload();
    expect(locker).toMatchObject({ status: "available", packageIdentifier: null, pickupCode: null, lastOccupiedAt: null });
    await expect(service.retrievePackage(input)).rejects.toMatchObject({ code: "PACKAGE_NOT_FOUND" });
  });

  it("lets exactly one simultaneous confirmation release an assignment", async () => {
    const locker = await createAssignment(new Date("2024-06-01T12:00:00.000Z"));
    const service = new LockerService(new LockerRepository(), undefined, () => new Date("2024-06-02T12:00:00.000Z"));
    const input = { lockerIdentifier: locker.identifier, pickupCode: locker.pickupCode!, confirmCharges: true };
    const outcomes = await Promise.allSettled([service.retrievePackage(input), service.retrievePackage(input)]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect((outcomes.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "PACKAGE_NOT_FOUND" });
    await locker.reload();
    expect(locker.status).toBe("available");
  });

  it("does not release an assignment with a missing storage timestamp", async () => {
    const locker = await createAssignment(new Date("2024-06-01T12:00:00.000Z"));
    await locker.update({ lastOccupiedAt: null });
    const service = new LockerService(new LockerRepository());
    await expect(service.retrievePackage({ lockerIdentifier: locker.identifier, pickupCode: locker.pickupCode! }))
      .rejects.toThrow("Invalid storage timestamp.");
    await locker.reload();
    expect(locker.status).toBe("occupied");
    expect(locker.packageIdentifier).toBe("ORDER-123");
    expect(locker.lastOccupiedAt).toBeNull();
  });
});
