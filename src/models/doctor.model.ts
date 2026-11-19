import { Schema, model, type InferSchemaType } from 'mongoose';
import { SPECIALIZATIONS } from '../constants/domain.js';

const doctorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    specialization: { type: String, required: true, enum: SPECIALIZATIONS },
    hospital: { type: String, required: true, trim: true, maxlength: 150 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  },
  { timestamps: true, versionKey: false },
);

// Uniqueness is enforced by the database, not just by a pre-check (avoids race conditions).
doctorSchema.index({ email: 1 }, { unique: true });
// Default listing order + date-range filter.
doctorSchema.index({ createdAt: -1, _id: -1 });
// Specialization filter combined with date sorting/filtering.
doctorSchema.index({ specialization: 1, createdAt: -1, _id: -1 });
// Sorting by name.
doctorSchema.index({ name: 1, _id: 1 });

export type Doctor = InferSchemaType<typeof doctorSchema>;
export const DoctorModel = model('Doctor', doctorSchema);
