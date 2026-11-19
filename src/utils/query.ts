export interface DateRange {
  from?: Date | undefined;
  to?: Date | undefined;
}

/** Builds a MongoDB createdAt filter from an optional range; undefined when no bounds. */
export function createdAtFilter({ from, to }: DateRange): { $gte?: Date; $lte?: Date } | undefined {
  if (!from && !to) return undefined;
  return { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
}

/** Removes keys whose value is undefined, so they don't end up in Mongo filters. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
