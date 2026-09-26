import type { Request, RequestHandler } from 'express';
import type { ZodError, ZodType } from 'zod';
import type { ErrorResponse } from '../types/error-response.ts';

type RequestSchemas<Params, Body, Query> = {
  params?: ZodType<Params>;
  query?: ZodType<Query>;
  body?: ZodType<Body>;
};

export const validateRequest = <
  Params = {},
  Body = unknown,
  Query = Request['query'],
>(
  schemas: RequestSchemas<Params, Body, Query>,
): RequestHandler<Params, unknown, Body, Query> => {
  return (req, res, next) => {
    const sendValidationError = (error: ZodError) => {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      } satisfies ErrorResponse);
    };

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) return sendValidationError(result.error);
      req.params = result.data;
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) return sendValidationError(result.error);
      // Express 5 exposes req.query as a getter, so the parsed value has to be defined over it.
      Object.defineProperty(req, 'query', { value: result.data });
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) return sendValidationError(result.error);
      req.body = result.data;
    }

    next();
  };
};
