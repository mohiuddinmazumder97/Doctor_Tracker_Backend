import type TestAgent from 'supertest/lib/agent.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { doctorInput, insertDoctor, insertPatient } from './factories.js';
import { loginAgent } from './helpers.js';

let agent: TestAgent;
beforeEach(async () => {
  agent = await loginAgent();
});

describe('doctor CRUD', () => {
  it('creates, reads, updates and deletes a doctor', async () => {
    const input = doctorInput({ email: 'House@Test.dev' });
    const created = await agent.post('/api/doctors').send(input).expect(201);
    expect(created.body.data).toMatchObject({ ...input, email: 'house@test.dev', patientCount: 0 });
    expect(created.body.data).not.toHaveProperty('__v');
    const id: string = created.body.data._id;

    const fetched = await agent.get(`/api/doctors/${id}`).expect(200);
    expect(fetched.body.data.name).toBe(input.name);

    const updated = await agent.patch(`/api/doctors/${id}`).send({ hospital: 'Princeton-Plainsboro' }).expect(200);
    expect(updated.body.data.hospital).toBe('Princeton-Plainsboro');
    expect(updated.body.data.name).toBe(input.name);

    await agent.delete(`/api/doctors/${id}`).expect(204);
    await agent.get(`/api/doctors/${id}`).expect(404);
  });

  it('rejects duplicate emails (case-insensitive) with 409', async () => {
    await agent.post('/api/doctors').send(doctorInput({ email: 'dup@test.dev' })).expect(201);
    const res = await agent.post('/api/doctors').send(doctorInput({ email: 'DUP@test.dev' })).expect(409);
    expect(res.body.error.details).toEqual([{ path: 'email', message: 'This email is already in use' }]);
  });

  it('validates input and rejects unknown fields', async () => {
    const res = await agent
      .post('/api/doctors')
      .send({ name: 'A', specialization: 'Wizardry', email: 'bad', phone: 'abc', createdAt: '2020-01-01' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const empty = await agent.patch(`/api/doctors/${await insertDoctor()}`).send({}).expect(400);
    expect(empty.body.error.details[0].message).toBe('Provide at least one field to update');
  });

  it('returns 400 for malformed ids and 404 for unknown ids', async () => {
    await agent.get('/api/doctors/not-an-id').expect(400);
    await agent.get('/api/doctors/507f1f77bcf86cd799439011').expect(404);
    await agent.patch('/api/doctors/507f1f77bcf86cd799439011').send({ name: 'Dr. Nobody' }).expect(404);
    await agent.delete('/api/doctors/507f1f77bcf86cd799439011').expect(404);
  });

  it('blocks deleting a doctor who still has patients', async () => {
    const doctorId = await insertDoctor();
    await insertPatient(doctorId);
    await insertPatient(doctorId);

    const res = await agent.delete(`/api/doctors/${doctorId}`).expect(409);
    expect(res.body.error.details).toEqual({ patientCount: 2 });
    await agent.get(`/api/doctors/${doctorId}`).expect(200);
  });
});

describe('GET /api/doctors (list)', () => {
  it('paginates with accurate metadata and stable ordering', async () => {
    for (let i = 0; i < 7; i++) await insertDoctor();
    const page1 = await agent.get('/api/doctors?limit=3&page=1').expect(200);
    const page3 = await agent.get('/api/doctors?limit=3&page=3').expect(200);

    expect(page1.body.meta).toEqual({ page: 1, limit: 3, total: 7, totalPages: 3 });
    expect(page1.body.data).toHaveLength(3);
    expect(page3.body.data).toHaveLength(1);

    const all = await agent.get('/api/doctors?limit=100').expect(200);
    const ids = new Set(all.body.data.map((d: { _id: string }) => d._id));
    expect(ids.size).toBe(7);
  });

  it('searches across name, email, hospital and specialization; treats regex characters literally', async () => {
    await insertDoctor({ name: 'Dr. Gregory House', hospital: 'Princeton', specialization: 'Neurology' });
    await insertDoctor({ name: 'Dr. Lisa Cuddy', email: 'lisa@ppth.org', specialization: 'Endocrinology' });
    await insertDoctor({ name: 'Dr. (a+)+ Edge', specialization: 'Oncology' });

    const search = async (q: string) =>
      (await agent.get('/api/doctors').query({ search: q }).expect(200)).body.data.map((d: { name: string }) => d.name);

    expect(await search('house')).toEqual(['Dr. Gregory House']);
    expect(await search('PPTH')).toEqual(['Dr. Lisa Cuddy']);
    expect(await search('princeton')).toEqual(['Dr. Gregory House']);
    expect(await search('endocrin')).toEqual(['Dr. Lisa Cuddy']);
    expect(await search('(a+)+')).toEqual(['Dr. (a+)+ Edge']);
    expect(await search('.*')).toEqual([]);
  });

  it('filters by specialization and creation date, and sorts by patient count', async () => {
    const busy = await insertDoctor({ specialization: 'Pediatrics' });
    await insertDoctor({ specialization: 'Pediatrics' });
    await insertDoctor({ specialization: 'Oncology' });
    for (let i = 0; i < 3; i++) await insertPatient(busy);

    const peds = await agent.get('/api/doctors?specialization=Pediatrics').expect(200);
    expect(peds.body.meta.total).toBe(2);

    const sorted = await agent.get('/api/doctors?sortBy=patientCount&order=desc').expect(200);
    expect(sorted.body.data[0]).toMatchObject({ _id: busy, patientCount: 3 });

    const future = await agent.get('/api/doctors?from=2999-01-01').expect(200);
    expect(future.body.meta.total).toBe(0);
    const today = new Date().toISOString().slice(0, 10);
    const todays = await agent.get(`/api/doctors?from=${today}&to=${today}`).expect(200);
    expect(todays.body.meta.total).toBe(3);

    await agent.get('/api/doctors?from=2026-02-01&to=2026-01-01').expect(400);
  });
});

describe('GET /api/doctors/:id/patients', () => {
  it("lists only that doctor's patients", async () => {
    const a = await insertDoctor();
    const b = await insertDoctor();
    await insertPatient(a, { fullName: 'Alice' });
    await insertPatient(a, { fullName: 'Aaron' });
    await insertPatient(b, { fullName: 'Bob' });

    const res = await agent.get(`/api/doctors/${a}/patients?sortBy=fullName&order=asc`).expect(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.map((p: { fullName: string }) => p.fullName)).toEqual(['Aaron', 'Alice']);
    expect(res.body.data[0].doctor._id).toBe(a);

    await agent.get('/api/doctors/507f1f77bcf86cd799439011/patients').expect(404);
  });
});
