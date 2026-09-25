import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("LockerRepository retrieval", () => {
  let container: StartedMySqlContainer | undefined;
  let sequelize: typeof import("../../src/configs/database.ts").sequelize;
  let Locker: typeof import("../../src/models/locker.model.ts").Locker;
  let LockerRepository: typeof import("../../src/repositories/locker.repository.ts").LockerRepository;

  beforeAll(async () => {
    container = await new MySqlContainer("mysql:8.4")
      .withDatabase("splms_test")
      .start();

    vi.stubEnv("DB_HOST", container.getHost());
    vi.stubEnv("DB_PORT", String(container.getPort()));
    vi.stubEnv("DB_NAME", container.getDatabase());
    vi.stubEnv("DB_USER", container.getUsername());
    vi.stubEnv("DB_PASSWORD", container.getUserPassword());
    vi.stubEnv("DB_LOG_SQL", "false");

    ({ sequelize } = await import("../../src/configs/database.ts"));
    ({ Locker } = await import("../../src/models/locker.model.ts"));
    ({ LockerRepository } = await import("../../src/repositories/locker.repository.ts"));
    await sequelize.sync();
  }, 120_000);

  afterAll(async () => {
    try {
      if (sequelize) await sequelize.close();
    } finally {
      try {
        await container?.stop();
      } finally {
        vi.unstubAllEnvs();
      }
    }
  }, 120_000);

  const createAssignment = async () => Locker.create({
    identifier: `test-${crypto.randomUUID()}`,
    size: "small",
    status: "occupied",
    packageIdentifier: "ORDER-123",
    pickupCode: crypto.randomUUID(),
    lastOccupiedAt: new Date("2024-06-01T12:00:00.000Z"),
  });

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
      (assignment) => ({ result: assignment, release: false }),
    );

    expect(result).toEqual({
      packageIdentifier: original.packageIdentifier,
      lastOccupiedAt: locker.lastOccupiedAt,
    });
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
      (assignment) => ({ result: assignment, release: true }),
    );

    expect(result).toEqual({
      packageIdentifier: "ORDER-123",
      lastOccupiedAt: new Date(occupiedAt!),
    });
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
        () => ({ result: "retrieved", release: true }),
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
  });

  it("does not call the decision callback when no occupied assignment matches", async () => {
    const locker = await createAssignment();
    let called = false;
    const result = await new LockerRepository().retrievePackage(
      locker.identifier,
      "wrong-code",
      () => {
        called = true;
        return { result: "retrieved", release: true };
      },
    );

    expect(result).toBeNull();
    expect(called).toBe(false);
    await locker.reload();
    expect(locker.status).toBe("occupied");
  });

  it("lets exactly one simultaneous request release the assignment", async () => {
    const locker = await createAssignment();
    const repository = new LockerRepository();
    const retrieve = () => repository.retrievePackage(
      locker.identifier,
      locker.pickupCode!,
      () => ({ result: "retrieved", release: true }),
    );

    const results = await Promise.all([retrieve(), retrieve()]);
    expect(results).toContain("retrieved");
    expect(results).toContain(null);
    await locker.reload();
    expect(locker.status).toBe("available");
  });
});
