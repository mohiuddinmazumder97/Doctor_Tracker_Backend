import * as dashboardRepo from '../repositories/dashboard.repository.js';
import { ApiError } from '../utils/ApiError.js';
import {
  addToCalendarDate,
  alignToBucket,
  compareCalendarDates,
  formatCalendarDate,
  startOfDayInZone,
  startOfMonthInZone,
  toCalendarDate,
} from '../utils/timezone.js';
import type {
  DistributionQuery,
  OverviewQuery,
  RangeQuery,
  TrendsQuery,
} from '../validators/dashboard.validator.js';

const MAX_TREND_BUCKETS = 400;

/** Default look-back window per interval when the client sends no `from`. */
const DEFAULT_BUCKETS = { day: 30, week: 12, month: 12 } as const;

function round(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export async function getOverview({ tz, recentLimit }: OverviewQuery, now = new Date()) {
  const thisMonthStart = startOfMonthInZone(now, tz, 0);
  const lastMonthStart = startOfMonthInZone(now, tz, -1);
  const lastMonthEnd = new Date(thisMonthStart.getTime() - 1);

  // Independent, index-backed queries run in parallel.
  const [
    totalDoctors,
    totalPatients,
    newDoctorsThisMonth,
    newDoctorsLastMonth,
    newPatientsThisMonth,
    newPatientsLastMonth,
    recentDoctors,
    recentPatients,
  ] = await Promise.all([
    dashboardRepo.countDoctors(),
    dashboardRepo.countPatients(),
    dashboardRepo.countDoctors({ from: thisMonthStart }),
    dashboardRepo.countDoctors({ from: lastMonthStart, to: lastMonthEnd }),
    dashboardRepo.countPatients({ from: thisMonthStart }),
    dashboardRepo.countPatients({ from: lastMonthStart, to: lastMonthEnd }),
    dashboardRepo.findRecentDoctors(recentLimit),
    dashboardRepo.findRecentPatients(recentLimit),
  ]);

  return {
    totals: { doctors: totalDoctors, patients: totalPatients },
    thisMonth: { doctors: newDoctorsThisMonth, patients: newPatientsThisMonth },
    lastMonth: { doctors: newDoctorsLastMonth, patients: newPatientsLastMonth },
    averagePatientsPerDoctor: totalDoctors === 0 ? 0 : round(totalPatients / totalDoctors),
    recentDoctors,
    recentPatients,
    period: { tz, thisMonthStart, lastMonthStart },
  };
}

/**
 * Registration trend with zero-filled buckets, so the line chart has a point for every
 * day/week/month in the range — including periods with no registrations.
 */
export async function getPatientTrends({ from, to, interval, tz }: TrendsQuery, now = new Date()) {
  const end = to ?? now;
  const endDate = toCalendarDate(end, tz);
  const startDate = alignToBucket(
    from ? toCalendarDate(from, tz) : addToCalendarDate(endDate, interval, -(DEFAULT_BUCKETS[interval] - 1)),
    interval,
  );
  const start = from ?? startOfDayInZone(startDate, tz);

  const buckets: string[] = [];
  for (
    let cursor = startDate;
    compareCalendarDates(cursor, endDate) <= 0;
    cursor = addToCalendarDate(cursor, interval, 1)
  ) {
    buckets.push(formatCalendarDate(cursor));
    if (buckets.length > MAX_TREND_BUCKETS) {
      throw ApiError.badRequest(`Range too large for "${interval}" interval — choose a wider interval`);
    }
  }

  const rows = await dashboardRepo.aggregatePatientTrends({ from: start, to: end }, interval, tz);
  const counts = new Map(rows.map((row) => [row._id, row.count]));
  const points = buckets.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }));

  return {
    interval,
    tz,
    from: start,
    to: end,
    total: points.reduce((sum, p) => sum + p.count, 0),
    points,
  };
}

export async function getDoctorDistribution({ from, to, limit }: DistributionQuery) {
  const { items, totalPatients, doctorsWithPatients } = await dashboardRepo.aggregateDoctorDistribution(
    { from, to },
    limit,
  );
  const shown = items.reduce((sum, item) => sum + item.patientCount, 0);
  return { items, totalPatients, doctorsWithPatients, otherPatients: totalPatients - shown };
}

export async function getConditionDistribution({ from, to }: RangeQuery) {
  const items = await dashboardRepo.aggregateConditionDistribution({ from, to });
  return { items, total: items.reduce((sum, item) => sum + item.count, 0) };
}

export async function getSpecializationDistribution({ from, to }: RangeQuery) {
  const items = await dashboardRepo.aggregateSpecializationDistribution({ from, to });
  return { items, totalDoctors: items.reduce((sum, item) => sum + item.doctorCount, 0) };
}
