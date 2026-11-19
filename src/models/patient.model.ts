import { Schema, model, type InferSchemaType } from 'mongoose';
import { GENDERS, MEDICAL_CONDITIONS } from '../constants/domain.js';

const addressSchema = new Schema(
  {
    street: { type: String, required: true, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100, default: '' },
    postalCode: { type: String, trim: true, maxlength: 20, default: '' },
    country: { type: String, required: true, trim: true, maxlength: 100 },
  },
  { _id: false },
);

const patientSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, required: true, enum: GENDERS },
    condition: { type: String, required: true, enum: MEDICAL_CONDITIONS },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    address: { type: addressSchema, required: true },
  },
  { timestamps: true, versionKey: false },
);

patientSchema.index({ email: 1 }, { unique: true });
// A doctor's patient list (newest first) and patients-per-doctor aggregation.
patientSchema.index({ doctor: 1, createdAt: -1, _id: -1 });
// Condition filter + condition distribution chart.
patientSchema.index({ condition: 1, createdAt: -1, _id: -1 });
// Default listing order, date-range filters and registration trends.
patientSchema.index({ createdAt: -1, _id: -1 });
patientSchema.index({ fullName: 1, _id: 1 });

export type Patient = InferSchemaType<typeof patientSchema>;
export const PatientModel = model('Patient', patientSchema);
