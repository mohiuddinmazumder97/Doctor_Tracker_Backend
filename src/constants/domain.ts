/**
 * Controlled vocabularies. Using fixed lists (instead of free text) keeps
 * filters and analytics consistent ("Diabetes" vs "diabetes type 2").
 * The frontend mirrors these lists.
 */
export const SPECIALIZATIONS = [
  'Cardiology',
  'Dermatology',
  'Endocrinology',
  'Gastroenterology',
  'General Practice',
  'Neurology',
  'Obstetrics & Gynecology',
  'Oncology',
  'Ophthalmology',
  'Orthopedics',
  'Pediatrics',
  'Psychiatry',
  'Pulmonology',
  'Other',
] as const;

export const MEDICAL_CONDITIONS = [
  'Hypertension',
  'Diabetes',
  'Asthma',
  'Heart Disease',
  'Arthritis',
  'Migraine',
  'Depression',
  'Anxiety',
  'Allergies',
  'Thyroid Disorder',
  'COPD',
  'Cancer',
  'Pregnancy',
  'Other',
] as const;

export const GENDERS = ['male', 'female', 'other'] as const;

export type Specialization = (typeof SPECIALIZATIONS)[number];
export type MedicalCondition = (typeof MEDICAL_CONDITIONS)[number];
export type Gender = (typeof GENDERS)[number];
