/**
 * OpenAPI 3.1 description of the API, served by Swagger UI at /api/docs.
 *
 * Request bodies and query parameters are generated from the same Zod schemas the
 * controllers validate with, so the docs cannot drift from the real validation rules.
 * Response schemas are written by hand and checked against real responses in
 * tests/openapi.test.ts.
 */
import { z } from 'zod';
import { GENDERS, MEDICAL_CONDITIONS, SPECIALIZATIONS } from '../constants/domain.js';
import { AUTH_COOKIE } from '../utils/cookies.js';
import { loginSchema } from '../validators/auth.validator.js';
import {
  distributionQuerySchema,
  overviewQuerySchema,
  rangeQuerySchema,
  trendsQuerySchema,
} from '../validators/dashboard.validator.js';
import { createDoctorSchema, listDoctorsQuerySchema, updateDoctorSchema } from '../validators/doctor.validator.js';
import {
  createPatientSchema,
  listDoctorPatientsQuerySchema,
  listPatientsQuerySchema,
  updatePatientSchema,
} from '../validators/patient.validator.js';

type Schema = Record<string, unknown>;

/** Zod → JSON Schema (draft 2020-12, which OpenAPI 3.1 uses natively), describing the accepted input. */
function fromZod(schema: z.ZodType): Schema {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Schema;
  return json;
}

/**
 * Expands an object query schema into individual OpenAPI query parameters. Examples are
 * moved into the description: Swagger UI pre-fills inputs from `example`, which would
 * silently filter every "Try it out" request.
 */
function queryParams(schema: z.ZodType) {
  const json = fromZod(schema) as { properties?: Record<string, Schema>; required?: string[] };
  return Object.entries(json.properties ?? {}).map(([name, property]) => {
    const { description, example, ...rest } = property;
    const text = [description, example !== undefined ? `e.g. \`${String(example)}\`` : undefined]
      .filter(Boolean)
      .join(' — ');
    return {
      name,
      in: 'query',
      required: json.required?.includes(name) ?? false,
      ...(text ? { description: text } : {}),
      schema: rest,
    };
  });
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Schema) => ({ content: { 'application/json': { schema } } });
const errorRef = (name: string) => ({ $ref: `#/components/responses/${name}` });

const success = (description: string, data: Schema, paginated = false) => ({
  description,
  ...json({
    type: 'object',
    required: paginated ? ['success', 'data', 'meta'] : ['success', 'data'],
    properties: {
      success: { const: true },
      data,
      ...(paginated ? { meta: ref('PaginationMeta') } : {}),
    },
    additionalProperties: false,
  }),
});

const objectId = { type: 'string', pattern: '^[a-f0-9]{24}$', example: '665f1c2e8b3a4d0012ab34cd' };
const dateTime = { type: 'string', format: 'date-time' };
const idParam = (resource: string) => ({
  name: 'id',
  in: 'path',
  required: true,
  description: `${resource} id (24-character hex ObjectId)`,
  schema: { type: 'string', pattern: '^[a-f0-9]{24}$' },
});

/** Strict object helper: every listed property is required unless named in `optional`. */
const object = (properties: Record<string, Schema>, optional: string[] = []): Schema => ({
  type: 'object',
  required: Object.keys(properties).filter((key) => !optional.includes(key)),
  properties,
  additionalProperties: false,
});

const doctorSummary = object({
  _id: objectId,
  name: { type: 'string' },
  specialization: { type: 'string', enum: [...SPECIALIZATIONS] },
  hospital: { type: 'string' },
});

const patientBase = {
  _id: objectId,
  fullName: { type: 'string' },
  email: { type: 'string', format: 'email' },
  phone: { type: 'string' },
  dateOfBirth: dateTime,
  gender: { type: 'string', enum: [...GENDERS] },
  condition: { type: 'string', enum: [...MEDICAL_CONDITIONS] },
  createdAt: dateTime,
  updatedAt: dateTime,
};

const address = object(
  {
    street: { type: 'string' },
    city: { type: 'string' },
    state: { type: 'string' },
    postalCode: { type: 'string' },
    country: { type: 'string' },
  },
  ['state', 'postalCode'],
);

const errorBody = (code: string, message: string) => ({
  success: false,
  error: { code, message },
});

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Doctor Tracker API',
      version: '1.0.0',
      description: [
        'REST API for the Doctor Tracker admin dashboard.',
        '',
        '**Authentication:** call `POST /api/auth/login` with the admin credentials (the demo login is listed in the project README).',
        `The API sets an HTTP-only \`${AUTH_COOKIE}\` cookie; the browser sends it automatically on every request from this page,`,
        'so after logging in here every “Try it out” call is authenticated. The token is never returned in a response body.',
        '',
        '**Envelope:** success → `{ success: true, data, meta? }`; error → `{ success: false, error: { code, message, details? } }`.',
      ].join('\n'),
    },
    servers: [{ url: '/', description: 'This server' }],
    tags: [
      { name: 'Health' },
      { name: 'Auth' },
      { name: 'Doctors' },
      { name: 'Patients', description: 'Every patient must reference an existing doctor.' },
      { name: 'Dashboard', description: 'Aggregations computed in MongoDB. Date ranges filter on createdAt.' },
    ],
    security: [{ cookieAuth: [] }],
    paths: {
      '/api/health': {
        get: {
          tags: ['Health'],
          summary: 'Liveness and database connectivity',
          security: [],
          responses: {
            200: success('Database connected', object({ status: { const: 'ok' } })),
            503: {
              description: 'Database unavailable',
              ...json({
                type: 'object',
                properties: { success: { const: false }, data: object({ status: { const: 'degraded' } }) },
              }),
            },
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Log in as an admin',
          description: 'Rate limited to 10 failed attempts per 15 minutes per IP + email.',
          security: [],
          requestBody: {
            required: true,
            ...json({ ...ref('LoginRequest'), example: { email: 'admin@doctortracker.dev', password: '<password>' } }),
          },
          responses: {
            200: {
              ...success('Logged in; the session cookie is set', object({ admin: ref('Admin') })),
              headers: {
                'Set-Cookie': {
                  description: `\`${AUTH_COOKIE}=<jwt>; Path=/; HttpOnly; SameSite=Lax\` (plus \`Secure\` in production)`,
                  schema: { type: 'string' },
                },
              },
            },
            400: errorRef('ValidationError'),
            401: {
              description: 'Wrong email or password',
              ...json({ ...ref('Error'), example: errorBody('UNAUTHORIZED', 'Invalid email or password') }),
            },
            429: errorRef('TooManyRequests'),
          },
        },
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Log out (clears the session cookie)',
          security: [],
          responses: { 204: { description: 'Logged out' } },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Current admin',
          responses: {
            200: success('The logged-in admin', object({ admin: ref('Admin') })),
            401: errorRef('Unauthorized'),
          },
        },
      },
      '/api/doctors': {
        get: {
          tags: ['Doctors'],
          summary: 'List doctors',
          description: '`search` matches name, hospital, specialization or email (case-insensitive).',
          parameters: queryParams(listDoctorsQuerySchema),
          responses: {
            200: success('A page of doctors', { type: 'array', items: ref('Doctor') }, true),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
          },
        },
        post: {
          tags: ['Doctors'],
          summary: 'Create a doctor',
          requestBody: { required: true, ...json(ref('CreateDoctorRequest')) },
          responses: {
            201: success('Created', ref('Doctor')),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
            409: errorRef('DuplicateEmail'),
          },
        },
      },
      '/api/doctors/{id}': {
        parameters: [idParam('Doctor')],
        get: {
          tags: ['Doctors'],
          summary: 'Get a doctor',
          responses: {
            200: success('The doctor', ref('Doctor')),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
            404: errorRef('NotFound'),
          },
        },
        patch: {
          tags: ['Doctors'],
          summary: 'Update a doctor',
          requestBody: { required: true, ...json(ref('UpdateDoctorRequest')) },
          responses: {
            200: success('Updated', ref('Doctor')),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
            404: errorRef('NotFound'),
            409: errorRef('DuplicateEmail'),
          },
        },
        delete: {
          tags: ['Doctors'],
          summary: 'Delete a doctor',
          description: 'Refused with 409 while the doctor still has patients — reassign or delete them first.',
          responses: {
            204: { description: 'Deleted' },
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
            404: errorRef('NotFound'),
            409: {
              description: 'The doctor still has assigned patients',
              ...json({
                ...ref('Error'),
                example: {
                  success: false,
                  error: {
                    code: 'CONFLICT',
                    message: 'This doctor has 3 assigned patients. Reassign or remove them before deleting.',
                    details: { patientCount: 3 },
                  },
                },
              }),
            },
          },
        },
      },
      '/api/doctors/{id}/patients': {
        parameters: [idParam('Doctor')],
        get: {
          tags: ['Doctors'],
          summary: "List a doctor's patients",
          parameters: queryParams(listDoctorPatientsQuerySchema),
          responses: {
            200: success('A page of patients', { type: 'array', items: ref('PatientListItem') }, true),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
            404: errorRef('NotFound'),
          },
        },
      },
      '/api/patients': {
        get: {
          tags: ['Patients'],
          summary: 'List patients',
          description: '`search` matches full name, email or phone (case-insensitive).',
          parameters: queryParams(listPatientsQuerySchema),
          responses: {
            200: success('A page of patients', { type: 'array', items: ref('PatientListItem') }, true),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
          },
        },
        post: {
          tags: ['Patients'],
          summary: 'Create a patient',
          description: 'Returns 400 with `details[0].path = "doctor"` if the doctor does not exist.',
          requestBody: { required: true, ...json(ref('CreatePatientRequest')) },
          responses: {
            201: success('Created', ref('Patient')),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
            409: errorRef('DuplicateEmail'),
          },
        },
      },
      '/api/patients/{id}': {
        parameters: [idParam('Patient')],
        get: {
          tags: ['Patients'],
          summary: 'Get a patient',
          responses: {
            200: success('The patient, with doctor contact details', ref('Patient')),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
            404: errorRef('NotFound'),
          },
        },
        patch: {
          tags: ['Patients'],
          summary: 'Update or reassign a patient',
          description: 'Send `{ "doctor": "<id>" }` to reassign the patient to another doctor.',
          requestBody: { required: true, ...json(ref('UpdatePatientRequest')) },
          responses: {
            200: success('Updated', ref('Patient')),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
            404: errorRef('NotFound'),
            409: errorRef('DuplicateEmail'),
          },
        },
        delete: {
          tags: ['Patients'],
          summary: 'Delete a patient',
          responses: {
            204: { description: 'Deleted' },
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
            404: errorRef('NotFound'),
          },
        },
      },
      '/api/dashboard/overview': {
        get: {
          tags: ['Dashboard'],
          summary: 'KPI totals, month-over-month counts and recent registrations',
          parameters: queryParams(overviewQuerySchema),
          responses: {
            200: success('Overview', ref('DashboardOverview')),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
          },
        },
      },
      '/api/dashboard/patient-trends': {
        get: {
          tags: ['Dashboard'],
          summary: 'Patient registrations over time (zero-filled buckets)',
          description:
            'Without `from`, defaults to the last 30 days / 12 weeks / 12 months for the chosen interval. Max 400 buckets.',
          parameters: queryParams(trendsQuerySchema),
          responses: {
            200: success('Trend', ref('PatientTrends')),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
          },
        },
      },
      '/api/dashboard/doctor-distribution': {
        get: {
          tags: ['Dashboard'],
          summary: 'Top doctors by patient count',
          parameters: queryParams(distributionQuerySchema),
          responses: {
            200: success('Distribution', ref('DoctorDistribution')),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
          },
        },
      },
      '/api/dashboard/condition-distribution': {
        get: {
          tags: ['Dashboard'],
          summary: 'Patients per medical condition',
          parameters: queryParams(rangeQuerySchema),
          responses: {
            200: success('Distribution', ref('ConditionDistribution')),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
          },
        },
      },
      '/api/dashboard/specialization-distribution': {
        get: {
          tags: ['Dashboard'],
          summary: 'Doctors (and their patients) per specialization',
          parameters: queryParams(rangeQuerySchema),
          responses: {
            200: success('Distribution', ref('SpecializationDistribution')),
            400: errorRef('ValidationError'),
            401: errorRef('Unauthorized'),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: AUTH_COOKIE,
          description: 'Set automatically by POST /api/auth/login.',
        },
      },
      schemas: {
        // Requests — generated from the Zod validators.
        LoginRequest: fromZod(loginSchema),
        CreateDoctorRequest: fromZod(createDoctorSchema),
        UpdateDoctorRequest: { ...fromZod(updateDoctorSchema), minProperties: 1 },
        CreatePatientRequest: fromZod(createPatientSchema),
        UpdatePatientRequest: { ...fromZod(updatePatientSchema), minProperties: 1 },

        // Responses.
        Admin: object({
          _id: objectId,
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { const: 'admin' },
        }),
        Doctor: object({
          ...(doctorSummary.properties as Schema),
          phone: { type: 'string' },
          email: { type: 'string', format: 'email' },
          patientCount: { type: 'integer', minimum: 0 },
          createdAt: dateTime,
          updatedAt: dateTime,
        }),
        DoctorSummary: doctorSummary,
        DoctorContact: object({
          ...(doctorSummary.properties as Schema),
          phone: { type: 'string' },
          email: { type: 'string', format: 'email' },
        }),
        PatientListItem: object({ ...patientBase, doctor: ref('DoctorSummary') }),
        Patient: object({ ...patientBase, address, doctor: ref('DoctorContact') }),
        PaginationMeta: object({
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1 },
          total: { type: 'integer', minimum: 0 },
          totalPages: { type: 'integer', minimum: 1 },
        }),
        DashboardOverview: object({
          totals: object({ doctors: { type: 'integer' }, patients: { type: 'integer' } }),
          thisMonth: object({ doctors: { type: 'integer' }, patients: { type: 'integer' } }),
          lastMonth: object({ doctors: { type: 'integer' }, patients: { type: 'integer' } }),
          averagePatientsPerDoctor: { type: 'number', description: 'Rounded to one decimal' },
          recentDoctors: {
            type: 'array',
            items: object({ ...(doctorSummary.properties as Schema), createdAt: dateTime }),
          },
          recentPatients: {
            type: 'array',
            items: object({
              _id: objectId,
              fullName: { type: 'string' },
              gender: { type: 'string', enum: [...GENDERS] },
              condition: { type: 'string', enum: [...MEDICAL_CONDITIONS] },
              doctor: object({
                _id: objectId,
                name: { type: 'string' },
                specialization: { type: 'string', enum: [...SPECIALIZATIONS] },
              }),
              createdAt: dateTime,
            }),
          },
          period: object({ tz: { type: 'string' }, thisMonthStart: dateTime, lastMonthStart: dateTime }),
        }),
        PatientTrends: object({
          interval: { type: 'string', enum: ['day', 'week', 'month'] },
          tz: { type: 'string' },
          from: dateTime,
          to: dateTime,
          total: { type: 'integer' },
          points: {
            type: 'array',
            items: object({
              bucket: { type: 'string', format: 'date', description: 'Bucket start date in `tz`' },
              count: { type: 'integer' },
            }),
          },
        }),
        DoctorDistribution: object({
          items: {
            type: 'array',
            items: object({
              doctorId: objectId,
              name: { type: 'string' },
              specialization: { type: 'string', enum: [...SPECIALIZATIONS] },
              patientCount: { type: 'integer' },
            }),
          },
          totalPatients: { type: 'integer' },
          doctorsWithPatients: { type: 'integer' },
          otherPatients: { type: 'integer', description: 'Patients of doctors outside the top `limit`' },
        }),
        ConditionDistribution: object({
          items: {
            type: 'array',
            items: object({
              condition: { type: 'string', enum: [...MEDICAL_CONDITIONS] },
              count: { type: 'integer' },
            }),
          },
          total: { type: 'integer' },
        }),
        SpecializationDistribution: object({
          items: {
            type: 'array',
            items: object({
              specialization: { type: 'string', enum: [...SPECIALIZATIONS] },
              doctorCount: { type: 'integer' },
              patientCount: { type: 'integer' },
            }),
          },
          totalDoctors: { type: 'integer' },
        }),
        Error: {
          type: 'object',
          required: ['success', 'error'],
          properties: {
            success: { const: false },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: {
                  type: 'string',
                  enum: [
                    'BAD_REQUEST',
                    'VALIDATION_ERROR',
                    'UNAUTHORIZED',
                    'FORBIDDEN',
                    'NOT_FOUND',
                    'CONFLICT',
                    'TOO_MANY_REQUESTS',
                    'INTERNAL_ERROR',
                  ],
                },
                message: { type: 'string' },
                details: {
                  description: 'Field errors for VALIDATION_ERROR / CONFLICT; extra context otherwise',
                },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      responses: {
        ValidationError: {
          description: 'Invalid input — `details` lists each field error',
          ...json({
            ...ref('Error'),
            example: {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Request validation failed',
                details: [{ path: 'email', message: 'Enter a valid email address' }],
              },
            },
          }),
        },
        Unauthorized: {
          description: 'Missing, invalid or expired session (the cookie is cleared)',
          ...json({ ...ref('Error'), example: errorBody('UNAUTHORIZED', 'Authentication required') }),
        },
        NotFound: {
          description: 'No record with this id',
          ...json({ ...ref('Error'), example: errorBody('NOT_FOUND', 'Doctor not found') }),
        },
        DuplicateEmail: {
          description: 'Email already in use',
          ...json({
            ...ref('Error'),
            example: {
              success: false,
              error: {
                code: 'CONFLICT',
                message: 'A record with this email already exists',
                details: [{ path: 'email', message: 'This email is already in use' }],
              },
            },
          }),
        },
        TooManyRequests: {
          description: 'Rate limit exceeded',
          ...json({
            ...ref('Error'),
            example: errorBody('TOO_MANY_REQUESTS', 'Too many login attempts. Please try again in 15 minutes.'),
          }),
        },
      },
    },
  };
}

export type OpenApiDocument = ReturnType<typeof buildOpenApiDocument>;
