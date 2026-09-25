import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { LockerController } from "../src/controllers/locker.controller.ts";
import { AppError } from "../src/errors/app-error.ts";
import type { LockerServicePort } from "../src/services/locker.service.ts";

const createTestApp = () => {
  const listLockerEvents = vi.fn<LockerServicePort["listLockerEvents"]>();
  const service = { listLockerEvents } as unknown as LockerServicePort;
  return { app: createApp(new LockerController(service)), listLockerEvents };
};

describe("GET /api/lockers/:lockerId/events", () => {
  it("passes validated filters and returns the paginated event response", async () => {
    const { app, listLockerEvents } = createTestApp();
    const payload = {
      data: [{
        id: 7,
        eventType: "package_retrieved" as const,
        lockerStatus: "available" as const,
        packageIdentifier: "ORDER-1",
        chargesInCents: 100,
        createdAt: "2024-06-02T00:00:00.000Z",
      }],
      pagination: { page: 2, limit: 1, total: 2, totalPages: 2 },
    };
    listLockerEvents.mockResolvedValue(payload);

    const response = await request(app).get("/api/lockers/12/events?page=2&limit=1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(listLockerEvents).toHaveBeenCalledWith({ lockerId: 12, page: 2, limit: 1 });
  });

  it.each([
    "/api/lockers/0/events",
    "/api/lockers/-1/events",
    "/api/lockers/abc/events",
    "/api/lockers/1.5/events",
    "/api/lockers/9007199254740992/events",
    "/api/lockers/1/events?page=0",
    "/api/lockers/1/events?limit=101",
    "/api/lockers/1/events?status=available",
    "/api/lockers/1/events?search=A1",
  ])("rejects invalid path or query input: %s", async (path) => {
    const { app, listLockerEvents } = createTestApp();

    const response = await request(app).get(path);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(listLockerEvents).not.toHaveBeenCalled();
  });

  it("returns 404 when the locker does not exist", async () => {
    const { app, listLockerEvents } = createTestApp();
    listLockerEvents.mockRejectedValue(new AppError(404, "LOCKER_NOT_FOUND", "Locker not found."));

    const response = await request(app).get("/api/lockers/123/events");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: "LOCKER_NOT_FOUND", message: "Locker not found." });
    expect(listLockerEvents).toHaveBeenCalledWith({ lockerId: 123, page: 1, limit: 10 });
  });
});
