import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error.ts';
import type { ErrorResponse } from '../types/error-response.ts';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res
      .status(error.status)
      .json({
        code: error.code,
        message: error.message,
      } satisfies ErrorResponse);
    return;
  }

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400
  ) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      details: [{ field: 'body', message: 'Request body must be valid JSON.' }],
    } satisfies ErrorResponse);
    return;
  }

  console.error(error);
  res.status(500).json({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred.',
  } satisfies ErrorResponse);
};
