import type { z } from 'zod';

/**
 * Parses untrusted request input against a Zod schema and returns fully typed data.
 * A ZodError is thrown on failure and converted into a 400 by the error handler.
 *
 * Used inside controllers rather than as a mutating middleware: in Express 5
 * `req.query` is a read-only getter, and this keeps inferred types end-to-end.
 */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  return schema.parse(input);
}
