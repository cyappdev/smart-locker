import { UniqueConstraintError } from "sequelize";
import { assert, describe, expect, it, vi } from "vitest";
import type { Locker } from "../../src/models/locker.model.ts";
import type { LockerRepositoryPort } from "../../src/repositories/locker.repository.ts";
import { LockerService } from "../../src/services/locker.service.ts";
import { AppError } from "../../src/errors/app-error.ts";

const makeLocker = (overrides: Partial<Locker> = {}) =>
  ({
    id: 1,
    identifier: "A1",
    size: "small",
    status: "available",
    packageIdentifier: null,
    pickupCode: null,
    lastOccupiedAt: null,
    ...overrides,
  }) as Locker;

const makeRepository = (
  overrides: Partial<LockerRepositoryPort> = {},
): LockerRepositoryPort => ({
  create: vi.fn(async (input) => makeLocker(input)),
  list: vi.fn(async () => ({ rows: [], count: 0 })),
  findAvailable: vi.fn(async () => null),
  assignPackage: vi.fn(async (locker, packageIdentifier, pickupCode, occupiedAt) =>
    makeLocker({
      ...locker,
      status: "occupied",
      packageIdentifier,
      pickupCode,
      lastOccupiedAt: occupiedAt,
    }),
  ),
  retrievePackage: vi.fn(async () => null),
  ...overrides,
});

describe("LockerService", () => {
  it.each([
    ["small", ["small", "medium", "large"]],
    ["medium", ["medium", "large"]],
    ["large", ["large"]],
  ] as const)("requests the smallest eligible locker for a %s package", async (size, eligible) => {
    const availableLocker = makeLocker({ size: eligible[0] });
    const repository = makeRepository({
      findAvailable: vi.fn(async () => availableLocker),
    });
    const service = new LockerService(repository, () => "000001");

    await service.storePackage({ size, packageIdentifier: "ORDER-1" });

    expect(repository.findAvailable).toHaveBeenCalledWith(eligible);
    expect(repository.assignPackage).toHaveBeenCalledWith(
      availableLocker,
      "ORDER-1",
      "000001",
      expect.any(Date),
    );
  });

  it.each([
    [['small', 'medium'], ['small', 'medium', 'large'], 1],
    [['small', 'medium', 'large'], ['small', 'medium', 'large'], 1],
    [['small'], ['small', 'medium', 'large'], 1],
    [['small', 'small', 'small'], ['small', 'medium', 'large'], 1]
  ])("returns not-found to concurrent callers when one locker is offered", async (packages, lockers, expectedStoredCount) => {
    const availableLocker = makeLocker();
    let available = true;
    const repository = makeRepository({
      findAvailable: vi.fn(async () => {
        if (!available) return null;
        available = false;
        return availableLocker;
      }),
    });
    const service = new LockerService(repository, () => "000001");

    const concurrentRequests: Promise<boolean>[] = packages.map((packageIdentifier) =>
      (async (): Promise<boolean> => {
        try {
          await service.storePackage({ size: "small", packageIdentifier });
          return true;
        } catch (error) {
          if (error instanceof AppError && error.code === "LOCKER_NOT_FOUND") {
            return false;
          }
          assert.fail(`Unexpected error type: ${error}`);
        }
      })(),
    );
    const results = await Promise.all(concurrentRequests);
    assert.equal(results.filter(Boolean).length, expectedStoredCount, "Only one request should succeed");
  });

  it("returns the stored assignment without exposing unrelated fields", async () => {
    const repository = makeRepository({
      findAvailable: vi.fn(async () => makeLocker()),
    });
    const service = new LockerService(repository, () => "048291");

    await expect(
      service.storePackage({ size: "small", packageIdentifier: "ORDER-123" }),
    ).resolves.toEqual({
      lockerId: 1,
      identifier: "A1",
      packageIdentifier: "ORDER-123",
      pickupCode: "048291",
      status: "occupied",
    });
  });

  it("returns LOCKER_NOT_FOUND when no suitable locker exists", async () => {
    const service = new LockerService(makeRepository(), () => "000001");

    await expect(
      service.storePackage({ size: "large", packageIdentifier: "ORDER-1" }),
    ).rejects.toMatchObject({
      status: 404,
      code: "LOCKER_NOT_FOUND",
      message: "No suitable locker found.",
    });
  });

  it("retries when a pickup code violates its unique constraint", async () => {
    const availableLocker = makeLocker();
    const assignPackage = vi
      .fn<LockerRepositoryPort["assignPackage"]>()
      .mockRejectedValueOnce(new UniqueConstraintError({ errors: [] }))
      .mockResolvedValueOnce(
        makeLocker({
          status: "occupied",
          packageIdentifier: "ORDER-1",
          pickupCode: "000002",
        }),
      );
    const repository = makeRepository({
      findAvailable: vi.fn(async () => availableLocker),
      assignPackage,
    });
    const codes = ["000001", "000002"];
    const service = new LockerService(repository, () => codes.shift()!);

    const result = await service.storePackage({
      size: "small",
      packageIdentifier: "ORDER-1",
    });

    expect(assignPackage).toHaveBeenCalledTimes(2);
    expect(result.pickupCode).toBe("000002");
  });

  it("calculates list pagination and returns current debug assignment fields", async () => {
    const row = makeLocker({
      pickupCode: "secret",
      packageIdentifier: "ORDER-1",
    });
    const repository = makeRepository({
      list: vi.fn(async () => ({ rows: [row], count: 21 })),
    });
    const service = new LockerService(repository);

    const result = await service.listLockers({ page: 2, limit: 10 });

    expect(result).toEqual({
      data: [{ id: 1, identifier: "A1", size: "small", status: "available", pickupCode: "secret", packageIdentifier: "ORDER-1" }],
      pagination: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });
    expect(result.data[0].pickupCode).toBe("secret");
  });

  it("retrieves the matching package before the first completed day", async () => {
    const occupiedAt = new Date("2024-06-01T12:00:00.000Z");
    const calculatedAt = new Date("2024-06-02T11:00:00.000Z");
    const repository = makeRepository({
      retrievePackage: vi.fn(async (_identifier, _code, decide) =>
        decide({ packageIdentifier: "ORDER-123", lastOccupiedAt: occupiedAt }).result,
      ),
    });
    const service = new LockerService(repository, undefined, () => calculatedAt);

    await expect(
      service.retrievePackage({ lockerIdentifier: "A1", pickupCode: "048291" }),
    ).resolves.toEqual({
      status: "retrieved",
      packageIdentifier: "ORDER-123",
      occupiedAt: occupiedAt.toISOString(),
      calculatedAt: calculatedAt.toISOString(),
      chargesInCents: 0,
    });
    expect(repository.retrievePackage).toHaveBeenCalledWith("A1", "048291", expect.any(Function));
  });

  it.each([undefined, false, true])("previews positive charges unless confirmed: %s", async (confirmCharges) => {
    const occupiedAt = new Date("2024-06-01T12:00:00.000Z");
    const decisions: boolean[] = [];
    const repository = makeRepository({
      retrievePackage: vi.fn(async (_identifier, _code, decide) => {
        const decision = decide({ packageIdentifier: "ORDER-123", lastOccupiedAt: occupiedAt });
        decisions.push(decision.release);
        return decision.result;
      }),
    });
    const service = new LockerService(repository, undefined, () => new Date("2024-06-02T12:00:00.000Z"));
    const result = await service.retrievePackage({ lockerIdentifier: "A1", pickupCode: "048291", confirmCharges });
    expect(result.status).toBe(confirmCharges === true ? "retrieved" : "charges_required");
    expect(result.chargesInCents).toBe(100);
    expect(decisions).toEqual([confirmCharges === true]);
  });

  it("recalculates a previewed charge when confirmation crosses a day boundary", async () => {
    const occupiedAt = new Date("2024-06-01T12:00:00.000Z");
    const times = [new Date("2024-06-02T12:00:00.000Z"), new Date("2024-06-03T12:00:00.000Z")];
    let occupied = true;
    const repository = makeRepository({
      retrievePackage: vi.fn(async (_identifier, _code, decide) => {
        if (!occupied) return null;
        const decision = decide({ packageIdentifier: "ORDER-123", lastOccupiedAt: occupiedAt });
        if (decision.release) occupied = false;
        return decision.result;
      }),
    });
    const service = new LockerService(repository, undefined, () => times.shift()!);
    const input = { lockerIdentifier: "A1", pickupCode: "048291" };

    expect(await service.retrievePackage(input)).toMatchObject({ status: "charges_required", chargesInCents: 100 });
    expect(await service.retrievePackage({ ...input, confirmCharges: true })).toMatchObject({ status: "retrieved", chargesInCents: 200 });
    await expect(service.retrievePackage(input)).rejects.toMatchObject({ code: "PACKAGE_NOT_FOUND" });
  });

  it.each([undefined, false, true])("retrieves zero-charge assignments regardless of confirmation: %s", async (confirmCharges) => {
    const repository = makeRepository({
      retrievePackage: vi.fn(async (_identifier, _code, decide) => {
        const decision = decide({ packageIdentifier: "ORDER-123", lastOccupiedAt: new Date("2024-06-01T12:00:00.000Z") });
        expect(decision.release).toBe(true);
        return decision.result;
      }),
    });
    const service = new LockerService(repository, undefined, () => new Date("2024-06-01T12:00:00.000Z"));
    expect((await service.retrievePackage({ lockerIdentifier: "A1", pickupCode: "048291", confirmCharges })).status).toBe("retrieved");
  });

  it.each([null, new Date("invalid"), new Date("2024-06-03T00:00:00.000Z")])("rejects invalid storage timestamp %s", async (lastOccupiedAt) => {
    const repository = makeRepository({
      retrievePackage: vi.fn(async (_identifier, _code, decide) => decide({ packageIdentifier: "ORDER-123", lastOccupiedAt }).result),
    });
    const service = new LockerService(repository, undefined, () => new Date("2024-06-02T00:00:00.000Z"));
    await expect(service.retrievePackage({ lockerIdentifier: "A1", pickupCode: "048291" })).rejects.toThrow();
  });

  it("returns PACKAGE_NOT_FOUND when no current assignment matches", async () => {
    const service = new LockerService(makeRepository());

    await expect(
      service.retrievePackage({ lockerIdentifier: "A1", pickupCode: "048291" }),
    ).rejects.toMatchObject({
      status: 404,
      code: "PACKAGE_NOT_FOUND",
      message:
        "No package found for the provided locker identifier and pickup code.",
    });
  });
});
