import express, { type Express, type Router } from 'express';
import cors from 'cors';
import { errorHandler } from './middlewares/error-handler.ts';

export interface AppRouters {
  health: Router;
  lockers: Router;
}

export const createApp = (routers: AppRouters): Express => {
  const app = express();
  app.use(
    cors(
      process.env.CORS_ALLOWED_ORIGIN
        ? { origin: process.env.CORS_ALLOWED_ORIGIN }
        : {},
    ),
  );
  app.use(express.json());

  app.use('/health', routers.health);
  app.use('/api/lockers', routers.lockers);

  app.use((_req, res) => {
    res.sendStatus(404);
  });

  app.use(errorHandler);

  return app;
};
