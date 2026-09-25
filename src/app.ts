import express, { type Express } from "express";
import type { LockerController } from "./controllers/locker.controller.ts";
import { errorHandler } from "./middlewares/error-handler.ts";
import { createLockerRouter } from "./routes/locker.route.ts";
import cors from "cors";

export const createApp = (controller?: LockerController): Express => {
  const app = express();
  app.use(cors(process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN } : {}));

  app.use(express.json());

  app.use("/api/lockers", createLockerRouter(controller));

  app.use(errorHandler);

  return app;
};
