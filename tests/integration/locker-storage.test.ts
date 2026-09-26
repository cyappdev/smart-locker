import { describe, expect, it, vi } from "vitest";
import { useTestDatabase, LockerEvent, SequelizeLockerRepository, LockerService } from "../helpers/mysql.ts";
import { createAssignment, createAvailableLocker } from "../helpers/lockers.ts";

describe("Package storage (MySQL)", () => {
  useTestDatabase();

  it("does not overwrite a locker selected before another assignment", async () => {
    const locker = await createAvailableLocker("small");
    const repository = new SequelizeLockerRepository();

    expect(await repository.assignPackage(locker, "ORDER-1", "101001", new Date())).toMatchObject({
      packageIdentifier: "ORDER-1",
    });
    expect(await repository.assignPackage(locker, "ORDER-2", "101002", new Date())).toBeNull();

    expect(await LockerEvent.findAll({ where: { lockerId: locker.id } }))
      .toMatchObject([{
        eventType: "package_stored",
        lockerStatus: "occupied",
        packageIdentifier: "ORDER-1",
        chargesInCents: null,
      }]);

    await locker.reload();
    expect(locker).toMatchObject({
      status: "occupied",
      packageIdentifier: "ORDER-1",
      pickupCode: "101001",
    });
  });

  it("assigns each available locker once under competing storage requests", async () => {
    const small = await createAvailableLocker("small");
    const medium = await createAvailableLocker("medium");
    const repository = new SequelizeLockerRepository();
    const findAvailable = repository.findAvailable.bind(repository);
    let firstSelections = 0;
    let releaseSelections!: () => void;
    const selectionsComplete = new Promise<void>((resolve) => { releaseSelections = resolve; });

    vi.spyOn(repository, "findAvailable").mockImplementation(async (sizes) => {
      const selected = await findAvailable(sizes);
      if (++firstSelections <= 3) {
        if (firstSelections === 3) releaseSelections();
        await selectionsComplete;
      }
      return selected;
    });

    const outcomes = await Promise.allSettled([1, 2, 3].map((number) =>
      new LockerService(repository, () => `10100${number}`).storePackage({
        size: "small",
        packageIdentifier: `ORDER-${number}`,
      }),
    ));

    const successes = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const failures = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(successes).toHaveLength(2);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatchObject({ code: "NO_AVAILABLE_LOCKER" });
    expect(new Set(successes.map((outcome) => outcome.value.lockerId))).toEqual(new Set([small.id, medium.id]));

    await Promise.all([small.reload(), medium.reload()]);
    for (const locker of [small, medium]) {
      const response = successes.find((outcome) => outcome.value.lockerId === locker.id)!.value;
      expect(locker).toMatchObject({
        status: "occupied",
        packageIdentifier: response.packageIdentifier,
        pickupCode: response.pickupCode,
      });
    }
  });

  it("rolls back a storage assignment when the pickup code is already in use", async () => {
    const existing = await createAssignment();
    const locker = await createAvailableLocker("small");
    const repository = new SequelizeLockerRepository();

    await expect(repository.assignPackage(locker, "ORDER-NEW", existing.pickupCode!, new Date()))
      .rejects.toMatchObject({ fields: { pickup_code: existing.pickupCode } });
    expect(await LockerEvent.count({ where: { lockerId: locker.id } })).toBe(0);
    await locker.reload();
    expect(locker).toMatchObject({
      status: "available",
      packageIdentifier: null,
      pickupCode: null,
      lastOccupiedAt: null,
    });

    expect(await repository.assignPackage(locker, "ORDER-NEW", "102001", new Date()))
      .toMatchObject({ status: "occupied", packageIdentifier: "ORDER-NEW" });
    expect(await LockerEvent.count({ where: { lockerId: locker.id } })).toBe(1);
  });

  it("rolls back storage when its event cannot be written", async () => {
    const locker = await createAvailableLocker("small");
    const hookName = "reject-storage-event";
    LockerEvent.addHook("beforeCreate", hookName, () => {
      throw new Error("event insert failed");
    });

    try {
      await expect(new SequelizeLockerRepository().assignPackage(locker, "ORDER-NEW", "303001", new Date()))
        .rejects.toThrow("event insert failed");
    } finally {
      LockerEvent.removeHook("beforeCreate", hookName);
    }

    await locker.reload();
    expect(locker).toMatchObject({
      status: "available",
      packageIdentifier: null,
      pickupCode: null,
      lastOccupiedAt: null,
    });
    expect(await LockerEvent.count({ where: { lockerId: locker.id } })).toBe(0);
  });

  it("stores only as many packages as there are lockers under a burst of requests", async () => {
    const lockers = await Promise.all(Array.from({ length: 4 }, () => createAvailableLocker("small")));
    const repository = new SequelizeLockerRepository();
    const outcomes = await Promise.allSettled(Array.from({ length: 12 }, (_, index) =>
      new LockerService(repository, () => String(200000 + index)).storePackage({
        size: "small",
        packageIdentifier: `BURST-${index}`,
      }),
    ));

    const successes = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const failures = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(successes).toHaveLength(lockers.length);
    expect(failures).toHaveLength(outcomes.length - lockers.length);
    expect(failures.every((outcome) => outcome.reason.code === "NO_AVAILABLE_LOCKER")).toBe(true);
    expect(new Set(successes.map((outcome) => outcome.value.lockerId)).size).toBe(lockers.length);

    await Promise.all(lockers.map((locker) => locker.reload()));
    for (const locker of lockers) {
      const response = successes.find((outcome) => outcome.value.lockerId === locker.id)!.value;
      expect(locker).toMatchObject({
        status: "occupied",
        packageIdentifier: response.packageIdentifier,
        pickupCode: response.pickupCode,
      });
    }
  }, 30_000);
});
