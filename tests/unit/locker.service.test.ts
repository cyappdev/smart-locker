import { UniqueConstraintError } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';
import type { Locker } from '../../src/models/locker.model.ts';
import type { LockerEvent } from '../../src/models/locker-event.model.ts';
import type { LockerRepository } from '../../src/repositories/locker.repository.ts';
import { LockerService } from '../../src/services/locker.service.ts';

const makeLocker = (overrides: Partial<Locker> = {}) =>
  ({
    id: 1,
    identifier: 'A1',
    size: 'small',
    status: 'available',
    packageIdentifier: null,
    pickupCode: null,
    lastOccupiedAt: null,
    ...overrides,
  }) as Locker;

const makeRepository = (
  overrides: Partial<LockerRepository> = {},
): LockerRepository => ({
  create: vi.fn(async (input) => makeLocker(input)),
  list: vi.fn(async () => ({ rows: [], count: 0 })),
  listEvents: vi.fn(async () => ({ rows: [], count: 0 })),
  findAvailable: vi.fn(async () => null),
  assignPackage: vi.fn(
    async (locker, packageIdentifier, pickupCode, occupiedAt) =>
      makeLocker({
        ...locker,
        status: 'occupied',
        packageIdentifier,
        pickupCode,
        lastOccupiedAt: occupiedAt,
      }),
  ),
  retrievePackage: vi.fn(async () => null),
  ...overrides,
});

describe('LockerService', () => {
  it('translates a duplicate locker identifier into a conflict', async () => {
    const repository = makeRepository({
      create: vi
        .fn<LockerRepository['create']>()
        .mockRejectedValue(
          new UniqueConstraintError({ fields: { identifier: 'A1' } }),
        ),
    });

    await expect(
      new LockerService(repository).createLocker({
        identifier: 'A1',
        size: 'small',
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'LOCKER_IDENTIFIER_EXISTS',
      message: 'A locker with the same identifier already exists.',
    });
  });

  it.each([
    [
      'another unique field',
      new UniqueConstraintError({ fields: { pickup_code: '000001' } }),
    ],
    ['missing constraint fields', new UniqueConstraintError({})],
    ['a database failure', new Error('Database unavailable')],
  ])('propagates %s when creating a locker', async (_description, error) => {
    const repository = makeRepository({
      create: vi.fn<LockerRepository['create']>().mockRejectedValue(error),
    });

    await expect(
      new LockerService(repository).createLocker({
        identifier: 'A1',
        size: 'small',
      }),
    ).rejects.toBe(error);
  });

  it.each([
    ['small', ['small', 'medium', 'large']],
    ['medium', ['medium', 'large']],
    ['large', ['large']],
  ] as const)(
    'requests the smallest eligible locker for a %s package',
    async (size, eligible) => {
      const availableLocker = makeLocker({ size: eligible[0] });
      const repository = makeRepository({
        findAvailable: vi.fn(async () => availableLocker),
      });
      const service = new LockerService(repository, () => '000001');

      await service.storePackage({ size, packageIdentifier: 'ORDER-1' });

      expect(repository.findAvailable).toHaveBeenCalledWith(eligible);
      expect(repository.assignPackage).toHaveBeenCalledWith(
        availableLocker,
        'ORDER-1',
        '000001',
        expect.any(Date),
      );
    },
  );

  it('searches again when another request claims the selected locker', async () => {
    const firstLocker = makeLocker();
    const nextLocker = makeLocker({ id: 2, identifier: 'A2' });
    const repository = makeRepository({
      findAvailable: vi
        .fn<LockerRepository['findAvailable']>()
        .mockResolvedValueOnce(firstLocker)
        .mockResolvedValueOnce(nextLocker),
    });
    vi.mocked(repository.assignPackage).mockResolvedValueOnce(null);
    const service = new LockerService(repository, () => '000001');

    const result = await service.storePackage({
      size: 'small',
      packageIdentifier: 'ORDER-1',
    });

    expect(result.lockerId).toBe(nextLocker.id);
    expect(repository.findAvailable).toHaveBeenCalledTimes(2);
    expect(repository.assignPackage).toHaveBeenNthCalledWith(
      2,
      nextLocker,
      'ORDER-1',
      '000001',
      expect.any(Date),
    );
  });

  it('returns not-found when the last available locker is claimed before assignment', async () => {
    const repository = makeRepository({
      findAvailable: vi
        .fn<LockerRepository['findAvailable']>()
        .mockResolvedValueOnce(makeLocker())
        .mockResolvedValueOnce(null),
      assignPackage: vi.fn(async () => null),
    });
    const service = new LockerService(repository, () => '000001');

    await expect(
      service.storePackage({ size: 'small', packageIdentifier: 'ORDER-1' }),
    ).rejects.toMatchObject({ code: 'NO_AVAILABLE_LOCKER' });
    expect(repository.assignPackage).toHaveBeenCalledTimes(1);
  });

  it('returns the stored assignment without exposing unrelated fields', async () => {
    const repository = makeRepository({
      findAvailable: vi.fn(async () => makeLocker()),
    });
    const occupiedAt = new Date('2024-06-01T12:00:00.000Z');
    const service = new LockerService(
      repository,
      () => '048291',
      () => occupiedAt,
    );

    await expect(
      service.storePackage({ size: 'small', packageIdentifier: 'ORDER-123' }),
    ).resolves.toEqual({
      lockerId: 1,
      identifier: 'A1',
      packageIdentifier: 'ORDER-123',
      pickupCode: '048291',
      status: 'occupied',
    });
    expect(repository.assignPackage).toHaveBeenCalledWith(
      expect.anything(),
      'ORDER-123',
      '048291',
      occupiedAt,
    );
  });

  it('returns NO_AVAILABLE_LOCKER when no suitable locker exists', async () => {
    const service = new LockerService(makeRepository(), () => '000001');

    await expect(
      service.storePackage({ size: 'large', packageIdentifier: 'ORDER-1' }),
    ).rejects.toMatchObject({
      status: 404,
      code: 'NO_AVAILABLE_LOCKER',
      message: 'No suitable locker found.',
    });
  });

  it('retries when a pickup code violates its unique constraint', async () => {
    const availableLocker = makeLocker();
    const assignPackage = vi
      .fn<LockerRepository['assignPackage']>()
      .mockRejectedValueOnce(
        new UniqueConstraintError({ fields: { pickup_code: '000001' } }),
      )
      .mockResolvedValueOnce(
        makeLocker({
          status: 'occupied',
          packageIdentifier: 'ORDER-1',
          pickupCode: '000002',
        }),
      );
    const repository = makeRepository({
      findAvailable: vi.fn(async () => availableLocker),
      assignPackage,
    });
    const codes = ['000001', '000002'];
    const service = new LockerService(repository, () => codes.shift()!);

    const result = await service.storePackage({
      size: 'small',
      packageIdentifier: 'ORDER-1',
    });

    expect(assignPackage).toHaveBeenCalledTimes(2);
    expect(assignPackage).toHaveBeenNthCalledWith(
      1,
      availableLocker,
      'ORDER-1',
      '000001',
      expect.any(Date),
    );
    expect(assignPackage).toHaveBeenNthCalledWith(
      2,
      availableLocker,
      'ORDER-1',
      '000002',
      expect.any(Date),
    );
    expect(result.pickupCode).toBe('000002');
  });

  it.each([
    [
      'another unique field',
      new UniqueConstraintError({ fields: { identifier: 'A1' } }),
    ],
    ['missing constraint fields', new UniqueConstraintError({})],
    [
      'the model attribute instead of the database column',
      new UniqueConstraintError({ fields: { pickupCode: '000001' } }),
    ],
    ['a database failure', new Error('Database unavailable')],
  ])('propagates %s without retrying', async (_description, error) => {
    const repository = makeRepository({
      findAvailable: vi.fn(async () => makeLocker()),
      assignPackage: vi
        .fn<LockerRepository['assignPackage']>()
        .mockRejectedValue(error),
    });
    const generatePickupCode = vi.fn(() => '000001');
    const service = new LockerService(repository, generatePickupCode);

    await expect(
      service.storePackage({ size: 'small', packageIdentifier: 'ORDER-1' }),
    ).rejects.toBe(error);

    expect(repository.assignPackage).toHaveBeenCalledTimes(1);
    expect(repository.findAvailable).toHaveBeenCalledTimes(1);
    expect(generatePickupCode).toHaveBeenCalledTimes(1);
  });

  it('stops after five pickup-code collisions', async () => {
    const repository = makeRepository({
      findAvailable: vi.fn(async () => makeLocker()),
      assignPackage: vi
        .fn<LockerRepository['assignPackage']>()
        .mockRejectedValue(
          new UniqueConstraintError({ fields: { pickup_code: '000001' } }),
        ),
    });
    const generatePickupCode = vi.fn(() => '000001');
    const service = new LockerService(repository, generatePickupCode);

    await expect(
      service.storePackage({ size: 'small', packageIdentifier: 'ORDER-1' }),
    ).rejects.toMatchObject({
      status: 500,
      code: 'PICKUP_CODE_GENERATION_FAILED',
    });

    expect(repository.assignPackage).toHaveBeenCalledTimes(5);
    expect(repository.findAvailable).toHaveBeenCalledTimes(1);
    expect(generatePickupCode).toHaveBeenCalledTimes(5);
  });

  it('calculates list pagination and returns current debug assignment fields', async () => {
    const row = makeLocker({
      pickupCode: 'secret',
      packageIdentifier: 'ORDER-1',
    });
    const repository = makeRepository({
      list: vi.fn(async () => ({ rows: [row], count: 21 })),
    });
    const service = new LockerService(repository);

    const result = await service.listLockers({ page: 2, limit: 10 });

    expect(result).toEqual({
      data: [
        {
          id: 1,
          identifier: 'A1',
          size: 'small',
          status: 'available',
          pickupCode: 'secret',
          packageIdentifier: 'ORDER-1',
        },
      ],
      pagination: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });
  });

  it('formats locker events and pagination without exposing locker internals', async () => {
    const repository = makeRepository({
      listEvents: vi.fn(async () => ({
        rows: [
          {
            id: 7,
            lockerId: 1,
            eventType: 'package_retrieved',
            lockerStatus: 'available',
            packageIdentifier: 'ORDER-1',
            chargesInCents: 100,
            createdAt: new Date('2024-06-02T00:00:00.000Z'),
          } as LockerEvent,
        ],
        count: 21,
      })),
    });

    const result = await new LockerService(repository).listLockerEvents({
      lockerId: 1,
      page: 2,
      limit: 10,
    });

    expect(result).toEqual({
      data: [
        {
          id: 7,
          eventType: 'package_retrieved',
          lockerStatus: 'available',
          packageIdentifier: 'ORDER-1',
          chargesInCents: 100,
          createdAt: '2024-06-02T00:00:00.000Z',
        },
      ],
      pagination: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });
    expect(repository.listEvents).toHaveBeenCalledWith({
      lockerId: 1,
      page: 2,
      limit: 10,
    });
  });

  it('returns LOCKER_NOT_FOUND when listing events for an unknown locker', async () => {
    const service = new LockerService(
      makeRepository({ listEvents: vi.fn(async () => null) }),
    );

    await expect(
      service.listLockerEvents({ lockerId: 999, page: 1, limit: 10 }),
    ).rejects.toMatchObject({ status: 404, code: 'LOCKER_NOT_FOUND' });
  });

  it('retrieves the matching package before the first completed day', async () => {
    const occupiedAt = new Date('2024-06-01T12:00:00.000Z');
    const calculatedAt = new Date('2024-06-02T11:00:00.000Z');
    const repository = makeRepository({
      retrievePackage: vi.fn(
        async (_identifier, _code, decide) =>
          decide({ packageIdentifier: 'ORDER-123', lastOccupiedAt: occupiedAt })
            .result,
      ),
    });
    const service = new LockerService(
      repository,
      undefined,
      () => calculatedAt,
    );

    await expect(
      service.retrievePackage({ lockerIdentifier: 'A1', pickupCode: '048291' }),
    ).resolves.toEqual({
      status: 'retrieved',
      packageIdentifier: 'ORDER-123',
      occupiedAt: occupiedAt.toISOString(),
      calculatedAt: calculatedAt.toISOString(),
      chargesInCents: 0,
    });
    expect(repository.retrievePackage).toHaveBeenCalledWith(
      'A1',
      '048291',
      expect.any(Function),
    );
  });

  it.each([undefined, false, true])(
    'previews positive charges unless confirmed: %s',
    async (confirmCharges) => {
      const occupiedAt = new Date('2024-06-01T12:00:00.000Z');
      const decisions: boolean[] = [];
      const charges: number[] = [];
      const repository = makeRepository({
        retrievePackage: vi.fn(async (_identifier, _code, decide) => {
          const decision = decide({
            packageIdentifier: 'ORDER-123',
            lastOccupiedAt: occupiedAt,
          });
          decisions.push(decision.release);
          charges.push(decision.chargesInCents);
          return decision.result;
        }),
      });
      const service = new LockerService(
        repository,
        undefined,
        () => new Date('2024-06-02T12:00:00.000Z'),
      );
      const result = await service.retrievePackage({
        lockerIdentifier: 'A1',
        pickupCode: '048291',
        confirmCharges,
      });
      expect(result.status).toBe(
        confirmCharges === true ? 'retrieved' : 'charges_required',
      );
      expect(result.chargesInCents).toBe(100);
      expect(decisions).toEqual([confirmCharges === true]);
      expect(charges).toEqual([100]);
    },
  );

  it('recalculates a previewed charge when confirmation crosses a day boundary', async () => {
    const occupiedAt = new Date('2024-06-01T12:00:00.000Z');
    const times = [
      new Date('2024-06-02T12:00:00.000Z'),
      new Date('2024-06-03T12:00:00.000Z'),
    ];
    let occupied = true;
    const repository = makeRepository({
      retrievePackage: vi.fn(async (_identifier, _code, decide) => {
        if (!occupied) return null;
        const decision = decide({
          packageIdentifier: 'ORDER-123',
          lastOccupiedAt: occupiedAt,
        });
        if (decision.release) occupied = false;
        return decision.result;
      }),
    });
    const service = new LockerService(repository, undefined, () =>
      times.shift()!,
    );
    const input = { lockerIdentifier: 'A1', pickupCode: '048291' };

    expect(await service.retrievePackage(input)).toMatchObject({
      status: 'charges_required',
      chargesInCents: 100,
    });
    expect(
      await service.retrievePackage({ ...input, confirmCharges: true }),
    ).toMatchObject({ status: 'retrieved', chargesInCents: 200 });
    await expect(service.retrievePackage(input)).rejects.toMatchObject({
      code: 'PACKAGE_NOT_FOUND',
    });
  });

  it.each([undefined, false, true])(
    'retrieves zero-charge assignments regardless of confirmation: %s',
    async (confirmCharges) => {
      const repository = makeRepository({
        retrievePackage: vi.fn(async (_identifier, _code, decide) => {
          const decision = decide({
            packageIdentifier: 'ORDER-123',
            lastOccupiedAt: new Date('2024-06-01T12:00:00.000Z'),
          });
          expect(decision.release).toBe(true);
          expect(decision.chargesInCents).toBe(0);
          return decision.result;
        }),
      });
      const service = new LockerService(
        repository,
        undefined,
        () => new Date('2024-06-01T12:00:00.000Z'),
      );
      expect(
        (
          await service.retrievePackage({
            lockerIdentifier: 'A1',
            pickupCode: '048291',
            confirmCharges,
          })
        ).status,
      ).toBe('retrieved');
    },
  );

  it.each([null, new Date('invalid'), new Date('2024-06-03T00:00:00.000Z')])(
    'rejects invalid storage timestamp %s',
    async (lastOccupiedAt) => {
      const repository = makeRepository({
        retrievePackage: vi.fn(
          async (_identifier, _code, decide) =>
            decide({ packageIdentifier: 'ORDER-123', lastOccupiedAt }).result,
        ),
      });
      const service = new LockerService(
        repository,
        undefined,
        () => new Date('2024-06-02T00:00:00.000Z'),
      );
      await expect(
        service.retrievePackage({
          lockerIdentifier: 'A1',
          pickupCode: '048291',
        }),
      ).rejects.toThrow();
    },
  );

  it('returns PACKAGE_NOT_FOUND when no current assignment matches', async () => {
    const service = new LockerService(makeRepository());

    await expect(
      service.retrievePackage({ lockerIdentifier: 'A1', pickupCode: '048291' }),
    ).rejects.toMatchObject({
      status: 404,
      code: 'PACKAGE_NOT_FOUND',
      message:
        'No package found for the provided locker identifier and pickup code.',
    });
  });
});
