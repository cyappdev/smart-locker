import { describe, expect, it } from "vitest";
import { useTestDatabase, sequelize, LockerEvent, SequelizeLockerRepository } from "../helpers/mysql.ts";
import { createAvailableLocker } from "../helpers/lockers.ts";

describe("Locker events (MySQL)", () => {
  useTestDatabase();

  it("persists a locker event with the requested columns", async () => {
    const locker = await createAvailableLocker("small");
    const event = await LockerEvent.create({
      lockerId: locker.id,
      eventType: "package_stored",
      lockerStatus: "available",
      packageIdentifier: null,
      chargesInCents: null,
    });

    expect(event.createdAt).toBeInstanceOf(Date);
    expect(await LockerEvent.findByPk(event.id)).toMatchObject({
      lockerId: locker.id,
      eventType: "package_stored",
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
      await LockerEvent.create({ lockerId: locker.id, eventType: "package_stored", lockerStatus: "available", packageIdentifier: null, chargesInCents: null, createdAt: new Date("2024-06-02T00:00:00.000Z") }),
      await LockerEvent.create({ lockerId: otherLocker.id, eventType: "package_stored", lockerStatus: "available", packageIdentifier: null, chargesInCents: null, createdAt: new Date("2024-06-03T00:00:00.000Z") }),
    ];
    const repository = new SequelizeLockerRepository();

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
});
