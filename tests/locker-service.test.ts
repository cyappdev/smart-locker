import { UniqueConstraintError } from "sequelize";
import { describe, expect, it, vi } from "vitest";
import type { Locker } from "../src/models/locker.model.ts";
import type { LockerRepositoryPort } from "../src/repositories/locker.repository.ts";
import { LockerService } from "../src/services/locker.service.ts";

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

  it("calculates list pagination and returns only public locker fields", async () => {
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
      data: [{ id: 1, identifier: "A1", size: "small", status: "available" }],
      pagination: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });
    expect(result.data[0]).not.toHaveProperty("pickupCode");
  });

  it("retrieves the matching package", async () => {
    const repository = makeRepository({
      retrievePackage: vi.fn(async () => "ORDER-123"),
    });
    const service = new LockerService(repository);

    await expect(
      service.retrievePackage({ lockerIdentifier: "A1", pickupCode: "048291" }),
    ).resolves.toEqual({ success: true, packageIdentifier: "ORDER-123" });
    expect(repository.retrievePackage).toHaveBeenCalledWith("A1", "048291");
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
