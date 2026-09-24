import request from "supertest";
import { UniqueConstraintError, type ValidationErrorItem } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { LockerController } from "../src/controllers/locker.controller.ts";
import { AppError } from "../src/errors/app-error.ts";
import type { Locker } from "../src/models/locker.model.ts";
import type { LockerServicePort } from "../src/services/locker.service.ts";

const locker = {
  id: 1,
  identifier: "A1",
  size: "small",
  status: "available",
} as Locker;

const createService = () => {
  const service: LockerServicePort = {
    createLocker: vi.fn(async () => locker),
    listLockers: vi.fn(async (input) => ({
      data: [
        {
          id: 1,
          identifier: "A1",
          size: "small" as const,
          status: "available" as const,
        },
      ],
      pagination: {
        page: input.page,
        limit: input.limit,
        total: 1,
        totalPages: 1,
      },
    })),
    storePackage: vi.fn(async (input) => ({
      lockerId: 1,
      identifier: "A1",
      packageIdentifier: input.packageIdentifier,
      pickupCode: "048291",
      status: "occupied" as const,
    })),
    retrievePackage: vi.fn(async () => ({
      success: true as const,
      packageIdentifier: "ORDER-123",
    })),
  };

  return service;
};

describe("Level 1 locker API", () => {
  let service: LockerServicePort;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    service = createService();
    app = createApp(new LockerController(service));
  });

  it("creates a locker and trims its identifier", async () => {
    const response = await request(app)
      .post("/lockers")
      .send({ identifier: " A1 ", size: "small" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: 1,
      identifier: "A1",
      size: "small",
      status: "available",
    });
    expect(service.createLocker).toHaveBeenCalledWith({
      identifier: "A1",
      size: "small",
    });
  });

  it("rejects undocumented create fields", async () => {
    const response = await request(app)
      .post("/lockers")
      .send({ identifier: "A1", size: "small", status: "occupied" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("Unrecognized") }),
      ]),
    );
    expect(service.createLocker).not.toHaveBeenCalled();
  });

  it("rejects missing and invalid create values", async () => {
    const response = await request(app)
      .post("/lockers")
      .send({ identifier: "", size: "extra-large" });

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "identifier" }),
        expect.objectContaining({ field: "size" }),
      ]),
    );
  });

  it("maps duplicate locker identifiers to the documented conflict", async () => {
    vi.mocked(service.createLocker).mockRejectedValueOnce(
      new UniqueConstraintError({
        errors: [{ path: "identifier" } as ValidationErrorItem],
      }),
    );

    const response = await request(app)
      .post("/lockers")
      .send({ identifier: "A1", size: "small" });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: "LOCKER_IDENTIFIER_EXISTS",
      message: "A locker with the same identifier already exists.",
    });
  });

  it("coerces and forwards list query parameters", async () => {
    const response = await request(app).get(
      "/lockers?page=2&limit=20&search=A&status=available",
    );

    expect(response.status).toBe(200);
    expect(service.listLockers).toHaveBeenCalledWith({
      page: 2,
      limit: 20,
      search: "A",
      status: "available",
    });
    expect(response.body.pagination).toMatchObject({ page: 2, limit: 20 });
  });

  it("applies list defaults", async () => {
    await request(app).get("/lockers").expect(200);

    expect(service.listLockers).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it("rejects invalid pagination and unknown query parameters", async () => {
    const invalidLimit = await request(app).get("/lockers?limit=101");
    const unknown = await request(app).get("/lockers?sort=desc");

    expect(invalidLimit.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(service.listLockers).not.toHaveBeenCalled();
  });

  it("stores a package through the documented endpoint", async () => {
    const response = await request(app)
      .post("/lockers/store")
      .send({ size: "small", packageIdentifier: " ORDER-123 " });

    expect(response.status).toBe(200);
    expect(service.storePackage).toHaveBeenCalledWith({
      size: "small",
      packageIdentifier: "ORDER-123",
    });
    expect(response.body).toEqual({
      lockerId: 1,
      identifier: "A1",
      packageIdentifier: "ORDER-123",
      pickupCode: "048291",
      status: "occupied",
    });
  });

  it("maps an unavailable locker to the documented not-found response", async () => {
    vi.mocked(service.storePackage).mockRejectedValueOnce(
      new AppError(404, "LOCKER_NOT_FOUND", "No suitable locker found."),
    );

    const response = await request(app)
      .post("/lockers/store")
      .send({ size: "large", packageIdentifier: "ORDER-404" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: "LOCKER_NOT_FOUND",
      message: "No suitable locker found.",
    });
  });

  it("retrieves a package and preserves a leading-zero pickup code", async () => {
    const response = await request(app)
      .post("/lockers/retrieve")
      .send({ lockerIdentifier: " A1 ", pickupCode: "048291" });

    expect(response.status).toBe(200);
    expect(service.retrievePackage).toHaveBeenCalledWith({
      lockerIdentifier: "A1",
      pickupCode: "048291",
    });
    expect(response.body).toEqual({
      success: true,
      packageIdentifier: "ORDER-123",
    });
  });

  it.each([
    [{ pickupCode: "048291" }, "lockerIdentifier"],
    [{ lockerIdentifier: "A1" }, "pickupCode"],
    [{ lockerIdentifier: "A1", pickupCode: 48291 }, "pickupCode"],
    [{ lockerIdentifier: "A1", pickupCode: "48291" }, "pickupCode"],
    [
      { lockerIdentifier: "A1", pickupCode: "048291", extra: true },
      "",
    ],
  ])("rejects an invalid retrieval body %#", async (body, field) => {
    const response = await request(app).post("/lockers/retrieve").send(body);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })]),
    );
    expect(service.retrievePackage).not.toHaveBeenCalled();
  });

  it("maps an unmatched retrieval to the documented not-found response", async () => {
    vi.mocked(service.retrievePackage).mockRejectedValueOnce(
      new AppError(
        404,
        "PACKAGE_NOT_FOUND",
        "No package found for the provided locker identifier and pickup code.",
      ),
    );

    const response = await request(app)
      .post("/lockers/retrieve")
      .send({ lockerIdentifier: "A1", pickupCode: "048291" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: "PACKAGE_NOT_FOUND",
      message:
        "No package found for the provided locker identifier and pickup code.",
    });
  });
});
