import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import { UniqueConstraintError } from "sequelize";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

describe("Locker storage and retrieval (MySQL)", () => {
  let container: StartedMySqlContainer | undefined;
  let sequelize: typeof import("../../src/configs/database.ts").sequelize;
  let Locker: typeof import("../../src/models/locker.model.ts").Locker;
  let LockerEvent: typeof import("../../src/models/locker-event.model.ts").LockerEvent;
  let LockerRepository: typeof import("../../src/repositories/locker.repository.ts").LockerRepository;
  let LockerService: typeof import("../../src/services/locker.service.ts").LockerService;

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
    ({ LockerEvent } = await import("../../src/models/locker-event.model.ts"));
    ({ LockerRepository } = await import("../../src/repositories/locker.repository.ts"));
    ({ LockerService } = await import("../../src/services/locker.service.ts"));
    await sequelize.sync();
  }, 120_000);

  afterEach(async () => {
    if (!sequelize) return;
    await LockerEvent.destroy({ where: {} });
    await Locker.destroy({ where: {} });
    vi.restoreAllMocks();
  });

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

  const createAvailableLocker = async (size: "small" | "medium" | "large") => Locker.create({
    identifier: `test-${crypto.randomUUID()}`,
    size,
    status: "available",
    packageIdentifier: null,
    pickupCode: null,
    lastOccupiedAt: null,
  });

  it("persists a locker event with the requested columns", async () => {
    const locker = await createAvailableLocker("small");
    const event = await LockerEvent.create({
      lockerId: locker.id,
      eventType: "status_changed",
      lockerStatus: "available",
      packageIdentifier: null,
      chargesInCents: null,
    });

    expect(event.createdAt).toBeInstanceOf(Date);
    expect(await LockerEvent.findByPk(event.id)).toMatchObject({
      lockerId: locker.id,
      eventType: "status_changed",
      lockerStatus: "available",
      packageIdentifier: null,
      chargesInCents: null,
    });
    const columns = Object.keys(await sequelize.getQueryInterface().describeTable("locker_events"));
    expect(columns).toEqual(expect.arrayContaining([
      "id", "locker_id", "event_type", "locker_status",
      "package_identifier", "charges_in_cents", "created_at",
    ]));
    expect(columns).not.toContain("updated_at");
  });

  it("lists only a locker's events newest first with pagination", async () => {
    const locker = await createAvailableLocker("small");
    const otherLocker = await createAvailableLocker("small");
    const events = [
      await LockerEvent.create({ lockerId: locker.id, eventType: "package_stored", lockerStatus: "occupied", packageIdentifier: "ORDER-1", chargesInCents: null, createdAt: new Date("2024-06-01T00:00:00.000Z") }),
      await LockerEvent.create({ lockerId: locker.id, eventType: "package_retrieved", lockerStatus: "available", packageIdentifier: "ORDER-1", chargesInCents: 100, createdAt: new Date("2024-06-02T00:00:00.000Z") }),
      await LockerEvent.create({ lockerId: locker.id, eventType: "status_changed", lockerStatus: "available", packageIdentifier: null, chargesInCents: null, createdAt: new Date("2024-06-02T00:00:00.000Z") }),
      await LockerEvent.create({ lockerId: otherLocker.id, eventType: "status_changed", lockerStatus: "available", packageIdentifier: null, chargesInCents: null, createdAt: new Date("2024-06-03T00:00:00.000Z") }),
    ];
    const repository = new LockerRepository();

    const firstPage = await repository.listEvents({ lockerId: locker.id, page: 1, limit: 1 });
    expect(firstPage?.count).toBe(3);
    expect(firstPage?.rows.map((event) => event.id)).toEqual([events[2].id]);

    const secondPage = await repository.listEvents({ lockerId: locker.id, page: 2, limit: 1 });
    expect(secondPage?.count).toBe(3);
    expect(secondPage?.rows.map((event) => event.id)).toEqual([events[1].id]);

    const emptyLocker = await createAvailableLocker("small");
    expect(await repository.listEvents({ lockerId: emptyLocker.id, page: 1, limit: 10 }))
      .toMatchObject({ count: 0, rows: [] });
    expect(await repository.listEvents({ lockerId: 999_999_999, page: 1, limit: 10 })).toBeNull();
  });

  it("does not overwrite a locker selected before another assignment", async () => {
    const locker = await createAvailableLocker("small");
    const repository = new LockerRepository();

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
    const repository = new LockerRepository();
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
    expect(failures[0].reason).toMatchObject({ code: "LOCKER_NOT_FOUND" });
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
    const repository = new LockerRepository();

    await expect(repository.assignPackage(locker, "ORDER-NEW", existing.pickupCode!, new Date()))
      .rejects.toBeInstanceOf(UniqueConstraintError);
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
      await expect(new LockerRepository().assignPackage(locker, "ORDER-NEW", "303001", new Date()))
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
    const repository = new LockerRepository();
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
    expect(failures.every((outcome) => outcome.reason.code === "LOCKER_NOT_FOUND")).toBe(true);
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

  it("creates, lists, stores and retrieves a package through HTTP", async () => {
    const { createApp } = await import("../../src/app.ts");
    const app = createApp();
    await request(app).post("/api/lockers").send({ identifier: "M1", size: "medium" }).expect(201);
    const created = await request(app).post("/api/lockers").send({ identifier: "S1", size: "small" }).expect(201);
    const duplicate = await request(app).post("/api/lockers").send({ identifier: "S1", size: "small" }).expect(409);
    expect(duplicate.body.code).toBe("LOCKER_IDENTIFIER_EXISTS");

    const stored = await request(app).post("/api/lockers/store")
      .send({ packageIdentifier: "ORDER-HTTP", size: "small" }).expect(200);
    expect(stored.body).toMatchObject({ lockerId: created.body.id, identifier: "S1", status: "occupied" });
    expect(stored.body.pickupCode).toMatch(/^\d{6}$/);

    const listed = await request(app).get("/api/lockers?status=occupied").expect(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0]).toMatchObject({ identifier: "S1", packageIdentifier: "ORDER-HTTP" });

    const input = { lockerIdentifier: "S1", pickupCode: stored.body.pickupCode };
    const retrieved = await request(app).post("/api/lockers/retrieve").send(input).expect(200);
    expect(retrieved.body).toMatchObject({ status: "retrieved", chargesInCents: 0, packageIdentifier: "ORDER-HTTP" });
    await request(app).post("/api/lockers/retrieve").send(input).expect(404);

    const events = await request(app).get(`/api/lockers/${created.body.id}/events`).expect(200);
    expect(events.body.data.map((event: { eventType: string }) => event.eventType))
      .toEqual(["package_retrieved", "package_stored"]);
  });

  it("keeps a charged package occupied until HTTP confirmation", async () => {
    const { createApp } = await import("../../src/app.ts");
    const { LockerController } = await import("../../src/controllers/locker.controller.ts");
    const locker = await createAssignment();
    await locker.update({ pickupCode: "654321" });
    const service = new LockerService(new LockerRepository(), undefined, () => new Date("2024-06-02T12:00:00.000Z"));
    const app = createApp(new LockerController(service));
    const input = { lockerIdentifier: locker.identifier, pickupCode: locker.pickupCode };

    const preview = await request(app).post("/api/lockers/retrieve").send(input).expect(200);
    expect(preview.body).toMatchObject({ status: "charges_required", chargesInCents: 100 });
    await locker.reload();
    expect(locker.status).toBe("occupied");
    expect(await LockerEvent.count()).toBe(0);

    const confirmed = await request(app).post("/api/lockers/retrieve")
      .send({ ...input, confirmCharges: true }).expect(200);
    expect(confirmed.body).toMatchObject({ status: "retrieved", chargesInCents: 100 });
    await locker.reload();
    expect(locker.status).toBe("available");
    expect(await LockerEvent.count()).toBe(1);
  });

  it.each([
    ["/api/lockers", { identifier: "", size: "small" }],
    ["/api/lockers/store", { packageIdentifier: "ORDER-1", size: "huge" }],
    ["/api/lockers/store", { packageIdentifier: "ORDER-1", size: "small", pickupCode: "123456" }],
    ["/api/lockers/retrieve", { lockerIdentifier: "A1", pickupCode: "123456", confirmCharges: "true" }],
  ])("rejects invalid input at %s before changing storage", async (path, body) => {
    const { createApp } = await import("../../src/app.ts");
    const response = await request(createApp()).post(path).send(body).expect(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(await Locker.count()).toBe(0);
    expect(await LockerEvent.count()).toBe(0);
  });
});
