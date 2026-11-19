import type TestAgent from 'supertest/lib/agent.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { getOverview, getPatientTrends } from '../src/services/dashboard.service.js';
import { startOfMonthInZone } from '../src/utils/timezone.js';
import { insertDoctor, insertPatient } from './factories.js';
import { loginAgent } from './helpers.js';

let agent: TestAgent;
beforeEach(async () => {
  agent = await loginAgent();
});

describe('dashboard analytics', () => {
  it('returns zeroed analytics for an empty database', async () => {
    const overview = await agent.get('/api/dashboard/overview').expect(200);
    expect(overview.body.data).toMatchObject({
      totals: { doctors: 0, patients: 0 },
      thisMonth: { doctors: 0, patients: 0 },
      averagePatientsPerDoctor: 0,
      recentDoctors: [],
      recentPatients: [],
    });
    const trends = await agent.get('/api/dashboard/patient-trends').expect(200);
    expect(trends.body.data.points).toHaveLength(12);
    expect(trends.body.data.total).toBe(0);
  });

  it('aggregates overview, distributions and reflects data changes', async () => {
    const cardio = await insertDoctor({ name: 'Dr. Heart', specialization: 'Cardiology' });
    const peds = await insertDoctor({ name: 'Dr. Kids', specialization: 'Pediatrics' });
    await insertDoctor({ name: 'Dr. Idle', specialization: 'Cardiology' });
    await insertPatient(cardio, { condition: 'Hypertension' });
    await insertPatient(cardio, { condition: 'Hypertension' });
    await insertPatient(peds, { condition: 'Asthma' });

    const overview = (await agent.get('/api/dashboard/overview').expect(200)).body.data;
    expect(overview.totals).toEqual({ doctors: 3, patients: 3 });
    expect(overview.thisMonth).toEqual({ doctors: 3, patients: 3 });
    expect(overview.averagePatientsPerDoctor).toBe(1);
    expect(overview.recentPatients[0].doctor).toHaveProperty('name');

    const doctors = (await agent.get('/api/dashboard/doctor-distribution?limit=1').expect(200)).body.data;
    expect(doctors).toMatchObject({
      items: [{ doctorId: cardio, name: 'Dr. Heart', specialization: 'Cardiology', patientCount: 2 }],
      totalPatients: 3,
      doctorsWithPatients: 2,
      otherPatients: 1,
    });

    const conditions = (await agent.get('/api/dashboard/condition-distribution').expect(200)).body.data;
    expect(conditions).toEqual({
      items: [
        { condition: 'Hypertension', count: 2 },
        { condition: 'Asthma', count: 1 },
      ],
      total: 3,
    });

    const specs = (await agent.get('/api/dashboard/specialization-distribution').expect(200)).body.data;
    expect(specs.items).toEqual([
      { specialization: 'Cardiology', doctorCount: 2, patientCount: 2 },
      { specialization: 'Pediatrics', doctorCount: 1, patientCount: 1 },
    ]);

    // Charts update when data changes.
    await insertPatient(peds, { condition: 'Asthma' });
    const after = (await agent.get('/api/dashboard/condition-distribution').expect(200)).body.data;
    expect(after.total).toBe(4);
  });

  it('applies date ranges to distributions', async () => {
    const doctor = await insertDoctor();
    await insertPatient(doctor, { condition: 'Migraine', createdAt: new Date('2025-03-15T12:00:00Z') });
    await insertPatient(doctor, { condition: 'Asthma' });

    const res = await agent
      .get('/api/dashboard/condition-distribution?from=2025-03-01&to=2025-03-31')
      .expect(200);
    expect(res.body.data.items).toEqual([{ condition: 'Migraine', count: 1 }]);
  });

  it('validates query parameters', async () => {
    await agent.get('/api/dashboard/patient-trends?interval=year').expect(400);
    await agent.get('/api/dashboard/overview?tz=Not/AZone').expect(400);
    await agent.get('/api/dashboard/patient-trends?interval=day&from=2000-01-01').expect(400);
  });
});

describe('time-zone aware bucketing', () => {
  it('counts a registration in the month of the admin time zone', async () => {
    const doctor = await insertDoctor();
    // 2026-10-31 20:00 UTC is already November 1st 02:00 in Dhaka (UTC+6).
    await insertPatient(doctor, { createdAt: new Date('2026-10-31T20:00:00Z') });
    const now = new Date('2026-11-15T12:00:00Z');

    const dhaka = await getOverview({ tz: 'Asia/Dhaka', recentLimit: 5 }, now);
    const utc = await getOverview({ tz: 'UTC', recentLimit: 5 }, now);
    expect(dhaka.thisMonth.patients).toBe(1);
    expect(utc.thisMonth.patients).toBe(0);
    expect(utc.lastMonth.patients).toBe(1);

    const trend = await getPatientTrends(
      { interval: 'month', tz: 'Asia/Dhaka', from: undefined, to: undefined },
      now,
    );
    expect(trend.points.at(-1)).toEqual({ bucket: '2026-11-01', count: 1 });
    expect(trend.points.at(-2)).toEqual({ bucket: '2026-10-01', count: 0 });
  });

  it('computes month starts across DST correctly', () => {
    // New York is UTC-4 in October (EDT) and UTC-5 in December (EST).
    const now = new Date('2026-12-10T12:00:00Z');
    expect(startOfMonthInZone(now, 'America/New_York').toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(startOfMonthInZone(now, 'America/New_York', -2).toISOString()).toBe('2026-10-01T04:00:00.000Z');
  });

  it('zero-fills weekly buckets aligned to Mondays', async () => {
    const doctor = await insertDoctor();
    await insertPatient(doctor, { createdAt: new Date('2026-11-11T10:00:00Z') }); // Wednesday
    const trend = await getPatientTrends(
      { interval: 'week', tz: 'UTC', from: new Date('2026-11-02T00:00:00Z'), to: new Date('2026-11-22T23:59:59Z') },
    );
    expect(trend.points).toEqual([
      { bucket: '2026-11-02', count: 0 },
      { bucket: '2026-11-09', count: 1 },
      { bucket: '2026-11-16', count: 0 },
    ]);
  });
});
