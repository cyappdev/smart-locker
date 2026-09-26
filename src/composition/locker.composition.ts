import { LockerController } from "../controllers/locker.controller.ts";
import { LockerRepository } from "../repositories/locker.repository.ts";
import { createLockerRouter } from "../routes/locker.route.ts";
import { LockerService } from "../services/locker.service.ts";

export const composeLocker = () => {
  const lockerRepository = new LockerRepository();
  const lockerService = new LockerService(lockerRepository);
  const lockerController = new LockerController(lockerService);

  return {
    lockerRouter: createLockerRouter(lockerController),
  };
};
