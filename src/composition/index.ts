import type { AppRouters } from "../app.ts";
import { composeLocker } from "./locker.composition.ts";
import { composeSystem } from "./system.composition.ts";

export const createRouters = (): AppRouters => {
  const { healthRouter } = composeSystem();
  const { lockerRouter } = composeLocker();

  return {
    health: healthRouter,
    lockers: lockerRouter,
  };
};
