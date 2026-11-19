import type TestAgent from 'supertest/lib/agent.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { insertDoctor, insertPatient, patientInput } from './factories.js';
import { loginAgent } from './helpers.js';

let agent: TestAgent;
let doctorId: string;
beforeEach(async () => {
  agent = await loginAgent();
  doctorId = await insertDoctor({ name: 'Dr. Primary' });
});

describe('patient CRUD', () => {
  it('creates a patient under a doctor and returns the populated doctor', async () => {
    const res = await agent.post('/api/patients').send(patientInput(doctorId)).expect(201);
    expect(res.body.data.doctor).toMatchObject({ _id: doctorId, name: 'Dr. Primary' });
    expect(res.body.data.address).toEqual({ street: '1 Main St', city: 'Boston', state: '', postalCode: '', country: 'USA' });

    const doctor = await agent.get(`/api/doctors/${doctorId}`).expect(200);
    expect(doctor.body.data.patientCount).toBe(1);
  });

  it('requires a valid, existing doctor', async () => {
    await agent.post('/api/patients').send(patientInput('nope')).expect(400);
    const res = await agent.post('/api/patients').send(patientInput('507f1f77bcf86cd799439011')).expect(400);
    expect(res.body.error.details).toEqual([{ path: 'doctor', message: 'Select an existing doctor' }]);

    const { doctor: _omit, ...withoutDoctor } = patientInput(doctorId);
    await agent.post('/api/patients').send(withoutDoctor).expect(400);
  });

  it('validates fields', async () => {
    const res = await agent
      .post('/api/patients')
      .send(patientInput(doctorId, { dateOfBirth: '2999-01-01', gender: 'x', condition: 'Flu', email: 'bad' }))
      .expect(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path).sort();
    expect(paths).toEqual(['condition', 'dateOfBirth', 'email', 'gender']);
  });

  it('rejects duplicate patient emails', async () => {
    await agent.post('/api/patients').send(patientInput(doctorId, { email: 'same@test.dev' })).expect(201);
    await agent.post('/api/patients').send(patientInput(doctorId, { email: 'same@test.dev' })).expect(409);
  });

  it('updates fields and reassigns to another doctor', async () => {
    const patientId = await insertPatient(doctorId);
    const other = await insertDoctor({ name: 'Dr. Second' });

    const res = await agent
      .patch(`/api/patients/${patientId}`)
      .send({ condition: 'Diabetes', doctor: other, address: { street: '9 Elm St', city: 'Austin', country: 'USA' } })
      .expect(200);
    expect(res.body.data).toMatchObject({ condition: 'Diabetes', doctor: { _id: other, name: 'Dr. Second' } });
    expect(res.body.data.address.city).toBe('Austin');

    await agent.patch(`/api/patients/${patientId}`).send({ doctor: '507f1f77bcf86cd799439011' }).expect(400);
    // Reassignment unblocks deletion of the original doctor.
    await agent.delete(`/api/doctors/${doctorId}`).expect(204);
  });

  it('deletes a patient', async () => {
    const patientId = await insertPatient(doctorId);
    await agent.delete(`/api/patients/${patientId}`).expect(204);
    await agent.get(`/api/patients/${patientId}`).expect(404);
    await agent.delete(`/api/patients/${patientId}`).expect(404);
  });
});

describe('GET /api/patients (list)', () => {
  it('searches by name, email and phone; filters by doctor, condition and date', async () => {
    const other = await insertDoctor();
    await insertPatient(doctorId, { fullName: 'Jane Roe', email: 'jane@mail.dev', phone: '+1 555 777 1234', condition: 'Asthma' });
    await insertPatient(doctorId, { fullName: 'John Doe', condition: 'Diabetes' });
    await insertPatient(other, { fullName: 'Old Timer', condition: 'Asthma', createdAt: new Date('2025-01-10') });

    const names = async (query: Record<string, string>) =>
      (await agent.get('/api/patients').query(query).expect(200)).body.data.map((p: { fullName: string }) => p.fullName).sort();

    expect(await names({ search: 'jane' })).toEqual(['Jane Roe']);
    expect(await names({ search: 'JANE@MAIL' })).toEqual(['Jane Roe']);
    expect(await names({ search: '777' })).toEqual(['Jane Roe']);
    expect(await names({ doctorId })).toEqual(['Jane Roe', 'John Doe']);
    expect(await names({ condition: 'Asthma' })).toEqual(['Jane Roe', 'Old Timer']);
    expect(await names({ condition: 'Asthma', doctorId: other })).toEqual(['Old Timer']);
    expect(await names({ from: '2025-01-01', to: '2025-12-31' })).toEqual(['Old Timer']);
  });

  it('returns list rows without the address (projection) and with a doctor summary', async () => {
    await insertPatient(doctorId);
    const res = await agent.get('/api/patients').expect(200);
    expect(res.body.data[0]).not.toHaveProperty('address');
    expect(Object.keys(res.body.data[0].doctor).sort()).toEqual(['_id', 'hospital', 'name', 'specialization']);
  });

  it('paginates', async () => {
    for (let i = 0; i < 5; i++) await insertPatient(doctorId);
    const res = await agent.get('/api/patients?limit=2&page=3').expect(200);
    expect(res.body.meta).toEqual({ page: 3, limit: 2, total: 5, totalPages: 3 });
    expect(res.body.data).toHaveLength(1);
  });
});
