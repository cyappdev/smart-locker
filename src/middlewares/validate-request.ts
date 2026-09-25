import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type RequestSchemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export const validateRequest = (schemas: RequestSchemas): RequestHandler => {
  return (req, res, next) => {
    for (const [source, schema] of Object.entries(schemas)) {
      if (!schema) continue;

      const result = schema.safeParse(req[source as keyof RequestSchemas]);
      if (!result.success) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Request validation failed.",
          details: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      if (source === "body") res.locals.validatedBody = result.data;
      if (source === "query") res.locals.validatedQuery = result.data;
      if (source === "params") res.locals.validatedParams = result.data;
    }

    next();
  };
};
