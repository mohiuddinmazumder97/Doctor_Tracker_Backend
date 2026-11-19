import { z } from 'zod';
import { isValidTimeZone } from '../utils/timezone.js';
import { dateRangeError, dateRangeFields, isValidDateRange } from './common.validator.js';

const timeZoneSchema = z
  .string()
  .trim()
  .max(64)
  .default('UTC')
  .refine(isValidTimeZone, 'Invalid IANA time zone');

const baseFields = { ...dateRangeFields, tz: timeZoneSchema };

export const overviewQuerySchema = z.object({ tz: timeZoneSchema, recentLimit: z.coerce.number().int().min(1).max(20).default(5) });

export const TREND_INTERVALS = ['day', 'week', 'month'] as const;

export const trendsQuerySchema = z
  .object({ ...baseFields, interval: z.enum(TREND_INTERVALS).default('month') })
  .refine(isValidDateRange, dateRangeError);

export const distributionQuerySchema = z
  .object({ ...baseFields, limit: z.coerce.number().int().min(1).max(50).default(10) })
  .refine(isValidDateRange, dateRangeError);

export const rangeQuerySchema = z.object(baseFields).refine(isValidDateRange, dateRangeError);

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
export type TrendsQuery = z.infer<typeof trendsQuerySchema>;
export type DistributionQuery = z.infer<typeof distributionQuerySchema>;
export type RangeQuery = z.infer<typeof rangeQuerySchema>;
