import express, { type Express } from "express";
import type { LockerController } from "./controllers/locker.controller.ts";
import { errorHandler } from "./middlewares/error-handler.ts";
import { createLockerRouter } from "./routes/locker.route.ts";

export const createApp = (controller?: LockerController): Express => {
  const app = express();

  app.use(express.json());
  app.use("/lockers", createLockerRouter(controller));
  app.use(errorHandler);

  return app;
};
