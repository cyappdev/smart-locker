import type { RequestHandler } from 'express';
import type {
  CreateLockerBody,
  ListLockerEventsParams,
  ListLockerEventsQuery,
  ListLockersQuery,
  RetrievePackageBody,
  StorePackageBody,
} from '../schemas/locker.schema.ts';
import type { LockerService } from '../services/locker.service.ts';
import type {
  CreateLockerResponse,
  ListLockerEventsResponse,
  ListLockersResponse,
  RetrievePackageResponse,
  StorePackageResponse,
} from '../types/locker-response.ts';

export class LockerController {
  private readonly service: LockerService;

  constructor(service: LockerService) {
    this.service = service;
  }

  create: RequestHandler<{}, CreateLockerResponse, CreateLockerBody> = async (
    req,
    res,
  ) => {
    res.status(201).json(await this.service.createLocker(req.body));
  };

  list: RequestHandler<{}, ListLockersResponse, unknown, ListLockersQuery> =
    async (req, res) => {
      res.json(await this.service.listLockers(req.query));
    };

  listEvents: RequestHandler<
    ListLockerEventsParams,
    ListLockerEventsResponse,
    unknown,
    ListLockerEventsQuery
  > = async (req, res) => {
    res.json(
      await this.service.listLockerEvents({ ...req.params, ...req.query }),
    );
  };

  store: RequestHandler<{}, StorePackageResponse, StorePackageBody> = async (
    req,
    res,
  ) => {
    res.json(await this.service.storePackage(req.body));
  };

  retrieve: RequestHandler<{}, RetrievePackageResponse, RetrievePackageBody> =
    async (req, res) => {
      res.json(await this.service.retrievePackage(req.body));
    };
}
