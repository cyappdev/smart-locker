import type { RequestHandler } from "express";
import type {
  CreateLockerInput,
  ListLockerEventsInput,
  ListLockersInput,
  RetrievePackageInput,
  StorePackageInput,
} from "../schemas/locker.schema.ts";
import {
  lockerService,
  type LockerServicePort,
} from "../services/locker.service.ts";

export class LockerController {
  private readonly service: LockerServicePort;

  constructor(service: LockerServicePort = lockerService) {
    this.service = service;
  }

  create: RequestHandler = async (_req, res) => {
    const input = res.locals.validatedBody as CreateLockerInput;
    const locker = await this.service.createLocker(input);

    res.status(201).json({
      id: locker.id,
      identifier: locker.identifier,
      size: locker.size,
      status: locker.status,
    });
  };

  list: RequestHandler = async (_req, res) => {
    const input = res.locals.validatedQuery as ListLockersInput;
    res.json(await this.service.listLockers(input));
  };

  listEvents: RequestHandler = async (_req, res) => {
    const params = res.locals.validatedParams as Pick<ListLockerEventsInput, "lockerId">;
    const query = res.locals.validatedQuery as Omit<ListLockerEventsInput, "lockerId">;
    res.json(await this.service.listLockerEvents({ ...params, ...query }));
  };

  store: RequestHandler = async (_req, res) => {
    const input = res.locals.validatedBody as StorePackageInput;
    res.json(await this.service.storePackage(input));
  };

  retrieve: RequestHandler = async (_req, res) => {
    const input = res.locals.validatedBody as RetrievePackageInput;
    res.json(await this.service.retrievePackage(input));
  };
}

export const lockerController = new LockerController();
