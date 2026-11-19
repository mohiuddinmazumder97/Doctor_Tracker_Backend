import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

export const objectIdSchema = z
  .string({ error: 'Id is required' })
  .refine((value) => isValidObjectId(value) && /^[a-f\d]{24}$/i.test(value), 'Invalid id')
  // .meta() only annotates the generated OpenAPI schema; it does not affect validation.
  .meta({ pattern: '^[a-fA-F0-9]{24}$', example: '665f1c2e8b3a4d0012ab34cd' });

export const idParamsSchema = z.object({ id: objectIdSchema });

/** Trimmed free-text search; "" becomes undefined so empty params are ignored. */
export const searchSchema = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => value || undefined);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses YYYY-MM-DD or an ISO timestamp (UTC). With `endOfDay`, a bare date is made
 * inclusive (23:59:59.999), so `from=2026-11-01&to=2026-11-01` covers that whole day.
 */
const dateParam = (endOfDay: boolean) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      const date = new Date(endOfDay && DATE_ONLY.test(value) ? `${value}T23:59:59.999Z` : value);
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'Invalid date' });
        return z.NEVER;
      }
      return date;
    })
    .meta({
      description: endOfDay
        ? 'Upper bound on createdAt — YYYY-MM-DD (inclusive, whole day) or ISO timestamp'
        : 'Lower bound on createdAt — YYYY-MM-DD or ISO timestamp',
      example: endOfDay ? '2026-11-30' : '2026-01-01',
    });

/** Spread into query schemas that support createdAt range filtering. */
export const dateRangeFields = { from: dateParam(false), to: dateParam(true) };

export const isValidDateRange = (range: { from?: Date | undefined; to?: Date | undefined }) =>
  !range.from || !range.to || range.from <= range.to;

export const dateRangeError = { message: '"from" must be before "to"', path: ['from'] };

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  order: z.enum(['asc', 'desc']).default('desc'),
});
