/**
 * Small, dependency-free helpers for calendar math in an IANA time zone.
 * Used so "this month" and trend buckets match the admin's local calendar.
 */

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatterCache.set(tz, f);
  }
  return f;
}

function zonedParts(instant: Date, tz: string) {
  const parts = Object.fromEntries(
    formatter(tz)
      .formatToParts(instant)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  return parts;
}

/** The calendar date of an instant as seen in `tz`. */
export function toCalendarDate(instant: Date, tz: string): CalendarDate {
  const { year, month, day } = zonedParts(instant, tz);
  return { year, month, day };
}

/** Offset of `tz` from UTC at the given instant, in ms (e.g. +06:00 → 21_600_000). */
function offsetMs(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant of local midnight at the start of the given calendar date in `tz`. */
export function startOfDayInZone({ year, month, day }: CalendarDate, tz: string): Date {
  const naiveUtc = Date.UTC(year, month - 1, day);
  let result = naiveUtc - offsetMs(new Date(naiveUtc), tz);
  // Second pass corrects for DST transitions between the guess and the real instant.
  result = naiveUtc - offsetMs(new Date(result), tz);
  return new Date(result);
}

/** Start of the month containing `now` in `tz`, shifted by `monthOffset` months. */
export function startOfMonthInZone(now: Date, tz: string, monthOffset = 0): Date {
  const { year, month } = toCalendarDate(now, tz);
  const shifted = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  return startOfDayInZone({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: 1 }, tz);
}

/** Pure calendar arithmetic (no time zones involved) on YYYY-MM-DD dates. */
export function addToCalendarDate(date: CalendarDate, unit: 'day' | 'week' | 'month', amount: number): CalendarDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + amount);
  else d.setUTCDate(d.getUTCDate() + amount * (unit === 'week' ? 7 : 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Aligns a calendar date to the start of its bucket (month → 1st, week → Monday). */
export function alignToBucket(date: CalendarDate, unit: 'day' | 'week' | 'month'): CalendarDate {
  if (unit === 'month') return { ...date, day: 1 };
  if (unit === 'week') {
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay(); // 0 = Sunday
    return addToCalendarDate(date, 'day', -((weekday + 6) % 7));
  }
  return date;
}

export function formatCalendarDate({ year, month, day }: CalendarDate): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return formatCalendarDate(a).localeCompare(formatCalendarDate(b));
}
