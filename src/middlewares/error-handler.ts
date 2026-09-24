import type { ErrorRequestHandler } from "express";
import { UniqueConstraintError } from "sequelize";
import { AppError } from "../errors/app-error.ts";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return;
  }

  if (
    error instanceof UniqueConstraintError &&
    error.errors.some((item) => item.path === "identifier")
  ) {
    res.status(409).json({
      code: "LOCKER_IDENTIFIER_EXISTS",
      message: "A locker with the same identifier already exists.",
    });
    return;
  }

  if (error instanceof SyntaxError && "status" in error && error.status === 400) {
    res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Request validation failed.",
      details: [{ field: "body", message: "Request body must be valid JSON." }],
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
  });
};
