import express from "express";
import {
  lockerController,
  type LockerController,
} from "../controllers/locker.controller.ts";
import { validateRequest } from "../middlewares/validate-request.ts";
import {
  createLockerSchema,
  listLockersSchema,
  retrievePackageSchema,
  storePackageSchema,
} from "../schemas/locker.schema.ts";

export const createLockerRouter = (
  controller: LockerController = lockerController,
) => {
  const router = express.Router();

  router.post("/", validateRequest({ body: createLockerSchema }), controller.create);
  router.get("/", validateRequest({ query: listLockersSchema }), controller.list);
  router.post(
    "/store",
    validateRequest({ body: storePackageSchema }),
    controller.store,
  );
  router.post(
    "/retrieve",
    validateRequest({ body: retrievePackageSchema }),
    controller.retrieve,
  );

  return router;
};

export const router = createLockerRouter();
