import { z } from 'zod';
import { SPECIALIZATIONS } from '../constants/domain.js';
import {
  dateRangeError,
  dateRangeFields,
  isValidDateRange,
  paginationSchema,
  searchSchema,
} from './common.validator.js';

export const PHONE_REGEX = /^\+?[0-9\s\-().]{7,20}$/;

export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254));

export const phoneSchema = z
  .string({ error: 'Phone is required' })
  .trim()
  .regex(PHONE_REGEX, 'Enter a valid phone number');

const doctorFields = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(100),
  specialization: z.enum(SPECIALIZATIONS, { error: 'Select a valid specialization' }),
  hospital: z
    .string({ error: 'Hospital is required' })
    .trim()
    .min(2, 'Hospital must be at least 2 characters')
    .max(150),
  phone: phoneSchema,
  email: emailSchema,
});

// .strict() rejects unknown fields (e.g. attempts to set _id or createdAt).
export const createDoctorSchema = doctorFields.strict();

export const updateDoctorSchema = doctorFields
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');

export const DOCTOR_SORT_FIELDS = ['createdAt', 'name', 'specialization', 'hospital', 'patientCount'] as const;

export const listDoctorsQuerySchema = paginationSchema
  .extend({
    search: searchSchema,
    specialization: z.enum(SPECIALIZATIONS).optional(),
    sortBy: z.enum(DOCTOR_SORT_FIELDS).default('createdAt'),
    ...dateRangeFields,
  })
  .refine(isValidDateRange, dateRangeError);

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type ListDoctorsQuery = z.infer<typeof listDoctorsQuerySchema>;
