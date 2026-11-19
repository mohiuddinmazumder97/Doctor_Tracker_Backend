import { z } from 'zod';
import { GENDERS, MEDICAL_CONDITIONS } from '../constants/domain.js';
import {
  dateRangeError,
  dateRangeFields,
  isValidDateRange,
  objectIdSchema,
  paginationSchema,
  searchSchema,
} from './common.validator.js';
import { emailSchema, phoneSchema } from './doctor.validator.js';

const addressSchema = z
  .object({
    street: z.string({ error: 'Street is required' }).trim().min(2, 'Street is required').max(200),
    city: z.string({ error: 'City is required' }).trim().min(2, 'City is required').max(100),
    state: z.string().trim().max(100).default(''),
    postalCode: z.string().trim().max(20).default(''),
    country: z.string({ error: 'Country is required' }).trim().min(2, 'Country is required').max(100),
  })
  .strict();

const dateOfBirthSchema = z.coerce
  .date({ error: 'Enter a valid date of birth' })
  .refine((date) => date <= new Date(), 'Date of birth cannot be in the future')
  .refine((date) => date.getUTCFullYear() >= 1900, 'Date of birth must be after 1900');

const patientFields = z.object({
  fullName: z
    .string({ error: 'Full name is required' })
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100),
  email: emailSchema,
  phone: phoneSchema,
  dateOfBirth: dateOfBirthSchema,
  gender: z.enum(GENDERS, { error: 'Select a valid gender' }),
  condition: z.enum(MEDICAL_CONDITIONS, { error: 'Select a valid medical condition' }),
  doctor: objectIdSchema,
  address: addressSchema,
});

export const createPatientSchema = patientFields.strict();

export const updatePatientSchema = patientFields
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');

export const PATIENT_SORT_FIELDS = ['createdAt', 'fullName', 'dateOfBirth', 'condition'] as const;

const patientListFields = {
  search: searchSchema,
  condition: z.enum(MEDICAL_CONDITIONS).optional(),
  gender: z.enum(GENDERS).optional(),
  sortBy: z.enum(PATIENT_SORT_FIELDS).default('createdAt'),
  ...dateRangeFields,
};

export const listPatientsQuerySchema = paginationSchema
  .extend({ ...patientListFields, doctorId: objectIdSchema.optional() })
  .refine(isValidDateRange, dateRangeError);

/** Same filters, scoped to one doctor via the route param (GET /doctors/:id/patients). */
export const listDoctorPatientsQuerySchema = paginationSchema
  .extend(patientListFields)
  .refine(isValidDateRange, dateRangeError);

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;
