import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const adminSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
    // Never returned by default; must be explicitly selected with .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin'], default: 'admin', required: true },
  },
  { timestamps: true },
);

export type Admin = InferSchemaType<typeof adminSchema>;
export type AdminDocument = HydratedDocument<Admin>;
export const AdminModel = model('Admin', adminSchema);
