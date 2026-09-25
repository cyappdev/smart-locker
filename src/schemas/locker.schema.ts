import { z } from "zod";
import { LOCKER_STATUSES } from "../types/locker-status.ts";
import { SIZE_CATEGORIES } from "../types/size-category.ts";

const identifier = z
  .string()
  .trim()
  .min(1, "Identifier is required.")
  .max(128, "Identifier must contain at most 128 characters.");

const packageIdentifier = z
  .string()
  .trim()
  .min(1, "Package identifier is required.")
  .max(128, "Package identifier must contain at most 128 characters.");

const pageNumber = z.coerce.number().int().min(1);
const pageLimit = z.coerce.number().int().min(1).max(100);

export const createLockerSchema = z
  .object({
    identifier,
    size: z.enum(SIZE_CATEGORIES),
  })
  .strict();

export const listLockersSchema = z
  .object({
    page: pageNumber.default(1),
    limit: pageLimit.default(10),
    search: z.string().trim().optional(),
    status: z.enum(LOCKER_STATUSES).optional(),
  })
  .strict();

export const storePackageSchema = z
  .object({
    size: z.enum(SIZE_CATEGORIES),
    packageIdentifier,
  })
  .strict();

export const retrievePackageSchema = z
  .object({
    lockerIdentifier: identifier,
    pickupCode: z
      .string()
      .regex(/^\d{6}$/, "Pickup code must contain exactly 6 digits."),
    confirmCharges: z.boolean().optional(),
  })
  .strict();

export type CreateLockerInput = z.infer<typeof createLockerSchema>;
export type ListLockersInput = z.infer<typeof listLockersSchema>;
export type StorePackageInput = z.infer<typeof storePackageSchema>;
export type RetrievePackageInput = z.infer<typeof retrievePackageSchema>;
