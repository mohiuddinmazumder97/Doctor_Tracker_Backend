import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

function isDuplicateKeyError(err: unknown): err is { code: 11000; keyValue?: Record<string, unknown> } {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

function isJsonSyntaxError(err: unknown): boolean {
  return err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err;
}

/** Converts any thrown error into the standard error envelope. */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    return new ApiError(
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  if (isDuplicateKeyError(err)) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
    return ApiError.conflict(`A record with this ${field} already exists`, [
      { path: field, message: `This ${field} is already in use` },
    ]);
  }

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for ${err.path}`);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return new ApiError(
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    );
  }

  if (isJsonSyntaxError(err)) {
    return ApiError.badRequest('Malformed JSON request body');
  }

  return new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again later.');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const apiError = toApiError(err);

  if (apiError.statusCode >= 500) {
    logger.error({ err, method: req.method, path: req.path }, 'Unhandled error');
  }

  res.status(apiError.statusCode).json({
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details !== undefined ? { details: apiError.details } : {}),
    },
  });
};
