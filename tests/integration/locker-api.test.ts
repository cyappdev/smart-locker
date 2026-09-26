import request from "supertest";
import { describe, expect, it } from "vitest";
import { useTestDatabase, Locker, LockerEvent, LockerRepository, LockerService } from "../helpers/mysql.ts";
import { createAssignment } from "../helpers/lockers.ts";

describe("Locker API (MySQL)", () => {
  useTestDatabase();

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
    const occupiedAt = locker.lastOccupiedAt?.toISOString();

    await request(app).post("/api/lockers/retrieve")
      .send({ ...input, pickupCode: "000000" }).expect(404);
    await request(app).post("/api/lockers/retrieve")
      .send({ ...input, lockerIdentifier: "missing-locker" }).expect(404);

    const preview = await request(app).post("/api/lockers/retrieve").send(input).expect(200);
    expect(preview.body).toMatchObject({ status: "charges_required", chargesInCents: 100 });
    await locker.reload();
    expect(locker).toMatchObject({
      status: "occupied", packageIdentifier: "ORDER-123", pickupCode: input.pickupCode,
    });
    expect(locker.lastOccupiedAt?.toISOString()).toBe(occupiedAt);
    expect(await LockerEvent.count()).toBe(0);

    const confirmed = await request(app).post("/api/lockers/retrieve")
      .send({ ...input, confirmCharges: true }).expect(200);
    expect(confirmed.body).toMatchObject({
      status: "retrieved", packageIdentifier: "ORDER-123", chargesInCents: 100,
    });
    await locker.reload();
    expect(locker).toMatchObject({
      status: "available", packageIdentifier: null, pickupCode: null, lastOccupiedAt: null,
    });
    expect(await LockerEvent.count()).toBe(1);
    await request(app).post("/api/lockers/retrieve").send(input).expect(404);
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
