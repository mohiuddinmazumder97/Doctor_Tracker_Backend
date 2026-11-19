/**
 * Contract test: real API responses must match the response schemas documented in
 * the OpenAPI spec (which use additionalProperties: false, so undocumented fields fail).
 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../src/docs/openapi.js';
import { doctorInput, insertDoctor, insertPatient, patientInput } from './factories.js';
import { app, loginAgent } from './helpers.js';

const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;

const spec = buildOpenApiDocument();
// strict: false — OpenAPI adds keywords (example) that plain JSON Schema doesn't define.
const ajv = addFormats(new Ajv2020({ strict: false, allErrors: true }));
ajv.addSchema({ $id: 'spec', components: spec.components });

type Operation = { responses: Record<string, { content?: { 'application/json': { schema: object } } } | { $ref: string }> };

function responseSchema(path: string, method: string, status: number) {
  const operation = (spec.paths as unknown as Record<string, Record<string, Operation>>)[path]?.[method];
  if (!operation) throw new Error(`${method.toUpperCase()} ${path} is not documented`);
  let response = operation.responses[status];
  if (!response) throw new Error(`${method.toUpperCase()} ${path} does not document status ${status}`);
  if ('$ref' in response) {
    const name = response.$ref.split('/').pop()!;
    response = (spec.components.responses as unknown as Record<string, typeof response>)[name]!;
  }
  if ('$ref' in response) throw new Error('nested response $ref');
  return response.content?.['application/json'].schema;
}

/** Rewrites local refs so they resolve against the registered spec components. */
const rebase = (schema: unknown): unknown =>
  JSON.parse(JSON.stringify(schema).replaceAll('"#/components/', '"spec#/components/'));

function expectMatches(path: string, method: string, res: request.Response) {
  const schema = responseSchema(path, method, res.status);
  if (!schema) {
    expect(res.text).toBe('');
    return;
  }
  const validate = ajv.compile(rebase(schema) as object);
  const valid = validate(res.body);
  expect(validate.errors ?? [], `${method.toUpperCase()} ${path} → ${res.status}`).toEqual([]);
  expect(valid).toBe(true);
}

let agent: TestAgent;
let doctorId: string;
let patientId: string;
beforeEach(async () => {
  agent = await loginAgent();
  doctorId = await insertDoctor();
  patientId = await insertPatient(doctorId);
});

describe('OpenAPI document', () => {
  it('is served as JSON and through Swagger UI without auth', async () => {
    const json = await request(app).get('/api/docs.json').expect(200);
    expect(json.body.openapi).toBe('3.1.0');
    const ui = await request(app).get('/api/docs/').expect(200);
    expect(ui.text).toContain('swagger-ui');
  });

  it('documents every request body with the validator rules', () => {
    const schemas = spec.components.schemas as Record<string, { required?: string[]; properties?: object }>;
    expect(schemas.CreatePatientRequest!.required).toEqual(
      expect.arrayContaining(['fullName', 'email', 'phone', 'dateOfBirth', 'gender', 'condition', 'doctor', 'address']),
    );
    expect(schemas.UpdateDoctorRequest!.required).toBeUndefined();
  });
});

describe('responses match the documented schemas', () => {
  it('auth', async () => {
    expectMatches('/api/auth/me', 'get', await agent.get('/api/auth/me'));
    expectMatches('/api/auth/me', 'get', await request(app).get('/api/auth/me'));
    expectMatches(
      '/api/auth/login',
      'post',
      await request(app).post('/api/auth/login').send({ email: 'admin@test.dev', password: 'wrong' }),
    );
    expectMatches('/api/auth/login', 'post', await request(app).post('/api/auth/login').send({ email: 'x' }));
    expectMatches('/api/auth/logout', 'post', await agent.post('/api/auth/logout'));
  });

  it('doctors', async () => {
    expectMatches('/api/doctors', 'get', await agent.get('/api/doctors?sortBy=patientCount'));
    expectMatches('/api/doctors', 'post', await agent.post('/api/doctors').send(doctorInput()));
    expectMatches('/api/doctors', 'post', await agent.post('/api/doctors').send({}));
    expectMatches('/api/doctors/{id}', 'get', await agent.get(`/api/doctors/${doctorId}`));
    expectMatches('/api/doctors/{id}', 'get', await agent.get('/api/doctors/507f1f77bcf86cd799439011'));
    expectMatches('/api/doctors/{id}', 'patch', await agent.patch(`/api/doctors/${doctorId}`).send({ hospital: 'Mercy' }));
    expectMatches('/api/doctors/{id}', 'delete', await agent.delete(`/api/doctors/${doctorId}`));
    expectMatches('/api/doctors/{id}/patients', 'get', await agent.get(`/api/doctors/${doctorId}/patients`));
  });

  it('patients', async () => {
    expectMatches('/api/patients', 'get', await agent.get('/api/patients'));
    expectMatches('/api/patients', 'post', await agent.post('/api/patients').send(patientInput(doctorId)));
    const duplicate = await agent.post('/api/patients').send(patientInput(doctorId, { email: 'dup@test.dev' }));
    expectMatches('/api/patients', 'post', duplicate);
    expectMatches(
      '/api/patients',
      'post',
      await agent.post('/api/patients').send(patientInput(doctorId, { email: 'dup@test.dev' })),
    );
    expectMatches('/api/patients/{id}', 'get', await agent.get(`/api/patients/${patientId}`));
    expectMatches('/api/patients/{id}', 'patch', await agent.patch(`/api/patients/${patientId}`).send({ condition: 'Migraine' }));
    expectMatches('/api/patients/{id}', 'delete', await agent.delete(`/api/patients/${patientId}`));
    expectMatches('/api/patients/{id}', 'delete', await agent.delete(`/api/patients/${patientId}`));
  });

  it('dashboard', async () => {
    expectMatches('/api/dashboard/overview', 'get', await agent.get('/api/dashboard/overview?tz=Asia/Dhaka'));
    expectMatches('/api/dashboard/patient-trends', 'get', await agent.get('/api/dashboard/patient-trends?interval=day'));
    expectMatches('/api/dashboard/patient-trends', 'get', await agent.get('/api/dashboard/patient-trends?tz=Mars/Base'));
    expectMatches('/api/dashboard/doctor-distribution', 'get', await agent.get('/api/dashboard/doctor-distribution'));
    expectMatches('/api/dashboard/condition-distribution', 'get', await agent.get('/api/dashboard/condition-distribution'));
    expectMatches(
      '/api/dashboard/specialization-distribution',
      'get',
      await agent.get('/api/dashboard/specialization-distribution'),
    );
  });

  it('health', async () => {
    expectMatches('/api/health', 'get', await request(app).get('/api/health'));
  });
});
