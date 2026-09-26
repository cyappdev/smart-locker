import { describe, expect, it } from "vitest";
import { useTestDatabase, Locker, LockerEvent, LockerRepository, LockerService } from "../helpers/mysql.ts";
import { createAssignment } from "../helpers/lockers.ts";

describe("Package retrieval (MySQL)", () => {
  useTestDatabase();

  it("leaves every assignment field unchanged after a preview", async () => {
    const locker = await createAssignment();
    const original = {
      status: locker.status,
      packageIdentifier: locker.packageIdentifier,
      pickupCode: locker.pickupCode,
      lastOccupiedAt: locker.lastOccupiedAt?.toISOString(),
    };

    const result = await new LockerRepository().retrievePackage(
      locker.identifier,
      locker.pickupCode!,
      (assignment) => ({ result: assignment, release: false, chargesInCents: 100 }),
    );

    expect(result).toEqual({
      packageIdentifier: original.packageIdentifier,
      lastOccupiedAt: locker.lastOccupiedAt,
    });
    expect(await LockerEvent.count({ where: { lockerId: locker.id } })).toBe(0);
    await locker.reload();
    expect({
      status: locker.status,
      packageIdentifier: locker.packageIdentifier,
      pickupCode: locker.pickupCode,
      lastOccupiedAt: locker.lastOccupiedAt?.toISOString(),
    }).toEqual(original);
  });

  it("returns the original assignment and clears it after release", async () => {
    const locker = await createAssignment();
    const occupiedAt = locker.lastOccupiedAt?.toISOString();

    const result = await new LockerRepository().retrievePackage(
      locker.identifier,
      locker.pickupCode!,
      (assignment) => ({ result: assignment, release: true, chargesInCents: 100 }),
    );

    expect(result).toEqual({
      packageIdentifier: "ORDER-123",
      lastOccupiedAt: new Date(occupiedAt!),
    });
    expect(await LockerEvent.findAll({ where: { lockerId: locker.id } }))
      .toMatchObject([{
        eventType: "package_retrieved",
        lockerStatus: "available",
        packageIdentifier: "ORDER-123",
        chargesInCents: 100,
      }]);
    await locker.reload();
    expect(locker).toMatchObject({
      status: "available",
      packageIdentifier: null,
      pickupCode: null,
      lastOccupiedAt: null,
    });
  });

  it("rolls back when the release update fails", async () => {
    const locker = await createAssignment();
    const hookName = "reject-retrieval-update";
    Locker.addHook("beforeUpdate", hookName, () => {
      throw new Error("update failed");
    });

    try {
      await expect(new LockerRepository().retrievePackage(
        locker.identifier,
        locker.pickupCode!,
        () => ({ result: "retrieved", release: true, chargesInCents: 0 }),
      )).rejects.toThrow("update failed");
    } finally {
      Locker.removeHook("beforeUpdate", hookName);
    }

    await locker.reload();
    expect(locker).toMatchObject({
      status: "occupied",
      packageIdentifier: "ORDER-123",
    });
    expect(locker.pickupCode).not.toBeNull();
    expect(locker.lastOccupiedAt).not.toBeNull();
    expect(await LockerEvent.count({ where: { lockerId: locker.id } })).toBe(0);
  });

  it("rolls back retrieval when its event cannot be written", async () => {
    const locker = await createAssignment();
    const hookName = "reject-retrieval-event";
    LockerEvent.addHook("beforeCreate", hookName, () => {
      throw new Error("event insert failed");
    });

    try {
      await expect(new LockerRepository().retrievePackage(
        locker.identifier,
        locker.pickupCode!,
        () => ({ result: "retrieved", release: true, chargesInCents: 100 }),
      )).rejects.toThrow("event insert failed");
    } finally {
      LockerEvent.removeHook("beforeCreate", hookName);
    }

    await locker.reload();
    expect(locker).toMatchObject({
      status: "occupied",
      packageIdentifier: "ORDER-123",
    });
    expect(locker.pickupCode).not.toBeNull();
    expect(locker.lastOccupiedAt).not.toBeNull();
    expect(await LockerEvent.count({ where: { lockerId: locker.id } })).toBe(0);
  });

  it("does not call the decision callback when no occupied assignment matches", async () => {
    const locker = await createAssignment();
    let called = false;
    const result = await new LockerRepository().retrievePackage(
      locker.identifier,
      "wrong-code",
      () => {
        called = true;
        return { result: "retrieved", release: true, chargesInCents: 0 };
      },
    );

    expect(result).toBeNull();
    expect(called).toBe(false);
    expect(await LockerEvent.count({ where: { lockerId: locker.id } })).toBe(0);
    await locker.reload();
    expect(locker.status).toBe("occupied");
  });

  it("lets exactly one simultaneous request release the assignment", async () => {
    const locker = await createAssignment();
    const repository = new LockerRepository();
    const retrieve = () => repository.retrievePackage(
      locker.identifier,
      locker.pickupCode!,
      () => ({ result: "retrieved", release: true, chargesInCents: 0 }),
    );

    const results = await Promise.all([retrieve(), retrieve()]);
    expect(results).toContain("retrieved");
    expect(results).toContain(null);
    await locker.reload();
    expect(locker.status).toBe("available");
    expect(await LockerEvent.findAll({ where: { lockerId: locker.id, eventType: "package_retrieved" } }))
      .toMatchObject([{
        lockerStatus: "available",
        packageIdentifier: "ORDER-123",
        chargesInCents: 0,
      }]);
  });

  it("lets exactly one simultaneous confirmation release an assignment", async () => {
    const locker = await createAssignment();
    const service = new LockerService(new LockerRepository(), undefined, () => new Date("2024-06-02T12:00:00.000Z"));
    const input = { lockerIdentifier: locker.identifier, pickupCode: locker.pickupCode!, confirmCharges: true };
    const outcomes = await Promise.allSettled([service.retrievePackage(input), service.retrievePackage(input)]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === "rejected")?.reason).toMatchObject({ code: "PACKAGE_NOT_FOUND" });
    await locker.reload();
    expect(locker.status).toBe("available");
  });

  it("does not release an assignment with a missing storage timestamp", async () => {
    const locker = await createAssignment();
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
