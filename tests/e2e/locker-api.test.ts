import type { Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createAssignment, createAvailableLocker } from "../helpers/lockers.ts";
import { LockerEvent, sequelize, useTestDatabase } from "../helpers/mysql.ts";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("Locker API", () => {
  useTestDatabase();

  let app: Express;

  beforeAll(async () => {
    const { createApp } = await import("../../src/app.ts");
    const { createRouters } = await import("../../src/composition/index.ts");
    app = createApp(createRouters());
  });

  it("stores a package in the smallest suitable locker and retrieves it", async () => {
    await request(app).post("/api/lockers").send({ identifier: "M1", size: "medium" }).expect(201);
    const created = await request(app)
      .post("/api/lockers")
      .send({ identifier: "S1", size: "small" })
      .expect(201);
    expect(created.body).toEqual({
      id: expect.any(Number),
      identifier: "S1",
      size: "small",
      status: "available",
    });

    const stored = await request(app)
      .post("/api/lockers/store")
      .send({ packageIdentifier: "ORDER-1", size: "small" })
      .expect(200);
    expect(stored.body).toMatchObject({ lockerId: created.body.id, identifier: "S1" });
    expect(stored.body.pickupCode).toMatch(/^\d{6}$/);

    const listed = await request(app).get("/api/lockers?status=occupied").expect(200);
    expect(listed.body.data).toMatchObject([{ identifier: "S1", packageIdentifier: "ORDER-1" }]);

    const input = { lockerIdentifier: "S1", pickupCode: stored.body.pickupCode };
    const retrieved = await request(app).post("/api/lockers/retrieve").send(input).expect(200);
    expect(retrieved.body).toMatchObject({
      status: "retrieved",
      packageIdentifier: "ORDER-1",
      chargesInCents: 0,
    });
    await request(app).post("/api/lockers/retrieve").send(input).expect(404);

    const events = await request(app).get(`/api/lockers/${created.body.id}/events`).expect(200);
    expect(events.body.data.map((event: { eventType: string }) => event.eventType)).toEqual([
      "package_retrieved",
      "package_stored",
    ]);
  });

  it("requires confirmation before releasing a charged package", async () => {
    const locker = await createAssignment({
      pickupCode: "654321",
      lastOccupiedAt: new Date(Date.now() - ONE_DAY_MS - 60_000),
    });
    const input = { lockerIdentifier: locker.identifier, pickupCode: "654321" };

    const preview = await request(app).post("/api/lockers/retrieve").send(input).expect(200);
    expect(preview.body).toMatchObject({ status: "charges_required", chargesInCents: 100 });

    // A preview leaves the package in the locker, so asking again still returns a preview.
    const secondPreview = await request(app).post("/api/lockers/retrieve").send(input).expect(200);
    expect(secondPreview.body.status).toBe("charges_required");

    const confirmed = await request(app)
      .post("/api/lockers/retrieve")
      .send({ ...input, confirmCharges: true })
      .expect(200);
    expect(confirmed.body).toMatchObject({ status: "retrieved", chargesInCents: 100 });
    await request(app).post("/api/lockers/retrieve").send(input).expect(404);
  });

  it.each([
    ["a wrong pickup code", { pickupCode: "000000" }],
    ["an unknown locker", { lockerIdentifier: "missing-locker" }],
  ])("returns 404 on retrieval with %s", async (_case, override) => {
    const locker = await createAssignment({ pickupCode: "654321" });

    const response = await request(app)
      .post("/api/lockers/retrieve")
      .send({ lockerIdentifier: locker.identifier, pickupCode: "654321", ...override })
      .expect(404);
    expect(response.body.code).toBe("PACKAGE_NOT_FOUND");
  });

  it("rejects a pickup code that belongs to another locker", async () => {
    const locker = await createAssignment({ pickupCode: "111111" });
    const otherLocker = await createAssignment({ pickupCode: "222222" });

    const response = await request(app)
      .post("/api/lockers/retrieve")
      .send({ lockerIdentifier: locker.identifier, pickupCode: "222222", confirmCharges: true })
      .expect(404);
    expect(response.body.code).toBe("PACKAGE_NOT_FOUND");
    expect((await locker.reload()).status).toBe("occupied");
    expect((await otherLocker.reload()).status).toBe("occupied");
  });

  it("returns 404 once every suitable locker is occupied", async () => {
    await createAvailableLocker("small");
    const body = { packageIdentifier: "ORDER-1", size: "small" };

    await request(app).post("/api/lockers/store").send(body).expect(200);
    const response = await request(app)
      .post("/api/lockers/store")
      .send({ ...body, packageIdentifier: "ORDER-2" })
      .expect(404);
    expect(response.body.code).toBe("NO_AVAILABLE_LOCKER");
  });

  it("returns 404 when no suitable locker is available", async () => {
    await createAvailableLocker("small");

    const response = await request(app)
      .post("/api/lockers/store")
      .send({ packageIdentifier: "ORDER-1", size: "large" })
      .expect(404);
    expect(response.body.code).toBe("NO_AVAILABLE_LOCKER");
  });

  it("rejects a duplicate locker identifier", async () => {
    await request(app).post("/api/lockers").send({ identifier: "S1", size: "small" }).expect(201);

    const response = await request(app)
      .post("/api/lockers")
      .send({ identifier: "S1", size: "large" })
      .expect(409);
    expect(response.body.code).toBe("LOCKER_IDENTIFIER_EXISTS");
  });

  it("filters lockers by identifier search", async () => {
    for (const identifier of ["A1", "A2", "B1"]) {
      await request(app).post("/api/lockers").send({ identifier, size: "small" }).expect(201);
    }

    const response = await request(app).get("/api/lockers?search=A").expect(200);
    expect(response.body.data.map((locker: { identifier: string }) => locker.identifier))
      .toEqual(["A1", "A2"]);
  });

  it("paginates a locker's events newest first", async () => {
    const locker = await createAvailableLocker("small");
    const event = { lockerId: locker.id, packageIdentifier: "ORDER-1" };
    await LockerEvent.create({
      ...event,
      eventType: "package_stored",
      lockerStatus: "occupied",
      chargesInCents: null,
      createdAt: new Date("2024-06-01T00:00:00.000Z"),
    });
    await LockerEvent.create({
      ...event,
      eventType: "package_retrieved",
      lockerStatus: "available",
      chargesInCents: 100,
      createdAt: new Date("2024-06-02T00:00:00.000Z"),
    });

    const response = await request(app)
      .get(`/api/lockers/${locker.id}/events?page=2&limit=1`)
      .expect(200);
    expect(response.body).toEqual({
      data: [
        {
          id: expect.any(Number),
          eventType: "package_stored",
          lockerStatus: "occupied",
          packageIdentifier: "ORDER-1",
          chargesInCents: null,
          createdAt: "2024-06-01T00:00:00.000Z",
        },
      ],
      pagination: { page: 2, limit: 1, total: 2, totalPages: 2 },
    });
  });

  it("returns 404 for the events of an unknown locker", async () => {
    const response = await request(app).get("/api/lockers/999999/events").expect(404);
    expect(response.body.code).toBe("LOCKER_NOT_FOUND");
  });

  it.each([
    ["/api/lockers", { identifier: "", size: "small" }],
    ["/api/lockers", { identifier: "A1", size: "huge" }],
    ["/api/lockers", { identifier: "A1", size: "small", status: "occupied" }],
    ["/api/lockers/store", { packageIdentifier: "ORDER-1", size: "huge" }],
    ["/api/lockers/store", { packageIdentifier: "ORDER-1", size: "small", pickupCode: "123456" }],
    ["/api/lockers/retrieve", { lockerIdentifier: "A1", pickupCode: "12345" }],
    ["/api/lockers/retrieve", { lockerIdentifier: "A1", pickupCode: 123456 }],
    ["/api/lockers/retrieve", { lockerIdentifier: "A1", pickupCode: "123456", confirmCharges: "true" }],
  ])("rejects POST %s with %j", async (path, body) => {
    const response = await request(app).post(path).send(body).expect(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it.each([
    "/api/lockers?page=0",
    "/api/lockers?limit=101",
    "/api/lockers?status=unknown",
    "/api/lockers/0/events",
    "/api/lockers/abc/events",
    "/api/lockers/1.5/events",
    "/api/lockers/9007199254740992/events",
    "/api/lockers/1/events?limit=101",
    "/api/lockers/1/events?status=available",
  ])("rejects GET %s", async (path) => {
    const response = await request(app).get(path).expect(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("reports healthy when the database is reachable", async () => {
    const response = await request(app).get("/health").expect(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("reports unhealthy when the database is unreachable", async () => {
    vi.spyOn(sequelize, "authenticate").mockRejectedValueOnce(new Error("connection refused"));

    const response = await request(app).get("/health").expect(503);
    expect(response.body).toEqual({ status: "error" });
  });

  it("returns a plain-text 404 for an unknown route", async () => {
    const response = await request(app).get("/api/unknown").expect(404);
    expect(response.type).toBe("text/plain");
    expect(response.text).toBe("Not Found");
  });

  it("rejects a malformed JSON body", async () => {
    const response = await request(app)
      .post("/api/lockers/store")
      .set("Content-Type", "application/json")
      .send('{"size":')
      .expect(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});
