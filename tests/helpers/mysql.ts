import {
  MySqlContainer,
  type StartedMySqlContainer,
} from '@testcontainers/mysql';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

export let sequelize: typeof import('../../src/configs/database.ts').sequelize;
export let Locker: typeof import('../../src/models/locker.model.ts').Locker;
export let LockerEvent: typeof import('../../src/models/locker-event.model.ts').LockerEvent;
export let SequelizeLockerRepository: typeof import('../../src/repositories/locker.repository.ts').SequelizeLockerRepository;
export let LockerService: typeof import('../../src/services/locker.service.ts').LockerService;

export const useTestDatabase = () => {
  let container: StartedMySqlContainer | undefined;

  beforeAll(async () => {
    container = await new MySqlContainer('mysql:8.4')
      .withDatabase('splms_test')
      .start();

    vi.stubEnv('DB_HOST', container.getHost());
    vi.stubEnv('DB_PORT', String(container.getPort()));
    vi.stubEnv('DB_NAME', container.getDatabase());
    vi.stubEnv('DB_USER', container.getUsername());
    vi.stubEnv('DB_PASSWORD', container.getUserPassword());

    // Database configuration is read on import, so set the container environment first.
    ({ sequelize } = await import('../../src/configs/database.ts'));
    ({ Locker } = await import('../../src/models/locker.model.ts'));
    ({ LockerEvent } = await import('../../src/models/locker-event.model.ts'));
    ({ SequelizeLockerRepository } =
      await import('../../src/repositories/locker.repository.ts'));
    ({ LockerService } = await import('../../src/services/locker.service.ts'));
    await sequelize.sync();
  }, 120_000);

  afterEach(async () => {
    if (!sequelize) return;
    await LockerEvent.destroy({ where: {} });
    await Locker.destroy({ where: {} });
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      if (sequelize) await sequelize.close();
    } finally {
      try {
        await container?.stop();
      } finally {
        vi.unstubAllEnvs();
      }
    }
  }, 120_000);
};
