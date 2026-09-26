import { z } from 'zod';
import { LOCKER_STATUSES, SIZE_CATEGORIES } from '../types/locker.ts';

const identifier = z
  .string()
  .trim()
  .min(1, 'Identifier is required.')
  .max(128, 'Identifier must contain at most 128 characters.');

const packageIdentifier = z
  .string()
  .trim()
  .min(1, 'Package identifier is required.')
  .max(128, 'Package identifier must contain at most 128 characters.');

const paginationQuery = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const createLockerSchema = z.strictObject({
  identifier,
  size: z.enum(SIZE_CATEGORIES),
});

export const listLockersSchema = paginationQuery.extend({
  search: z.string().trim().max(128).optional(),
  status: z.enum(LOCKER_STATUSES).optional(),
});

export const listLockerEventsParamsSchema = z.strictObject({
  lockerId: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().safe().positive()),
});

export const listLockerEventsQuerySchema = paginationQuery;

export const storePackageSchema = z.strictObject({
  size: z.enum(SIZE_CATEGORIES),
  packageIdentifier,
});

export const retrievePackageSchema = z.strictObject({
  lockerIdentifier: identifier,
  pickupCode: z
    .string()
    .regex(/^\d{6}$/, 'Pickup code must contain exactly 6 digits.'),
  confirmCharges: z.boolean().optional(),
});

export type CreateLockerBody = z.infer<typeof createLockerSchema>;
export type ListLockersQuery = z.infer<typeof listLockersSchema>;
export type ListLockerEventsParams = z.infer<
  typeof listLockerEventsParamsSchema
>;
export type ListLockerEventsQuery = z.infer<typeof listLockerEventsQuerySchema>;
export type ListLockerEventsInput = ListLockerEventsParams &
  ListLockerEventsQuery;
export type StorePackageBody = z.infer<typeof storePackageSchema>;
export type RetrievePackageBody = z.infer<typeof retrievePackageSchema>;
