import { DoctorModel } from '../src/models/doctor.model.js';
import { PatientModel } from '../src/models/patient.model.js';

let sequence = 0;
const next = () => ++sequence;

export function doctorInput(overrides: Record<string, unknown> = {}) {
  const n = next();
  return {
    name: `Dr. Test ${n}`,
    specialization: 'Cardiology',
    hospital: 'General Hospital',
    phone: '+1 555 010 0000',
    email: `doctor${n}@test.dev`,
    ...overrides,
  };
}

export function patientInput(doctor: string, overrides: Record<string, unknown> = {}) {
  const n = next();
  return {
    fullName: `Patient ${n}`,
    email: `patient${n}@test.dev`,
    phone: '+1 555 020 0000',
    dateOfBirth: '1990-01-15',
    gender: 'female',
    condition: 'Asthma',
    doctor,
    address: { street: '1 Main St', city: 'Boston', country: 'USA' },
    ...overrides,
  };
}

/** Inserts directly (bypassing the API) — supports a backdated createdAt for analytics tests. */
export async function insertDoctor(overrides: Record<string, unknown> = {}) {
  const doc = await new DoctorModel(doctorInput(overrides)).save();
  return String(doc._id);
}

export async function insertPatient(doctor: string, overrides: Record<string, unknown> = {}) {
  const { createdAt, ...rest } = overrides;
  const doc = new PatientModel(patientInput(doctor, rest));
  if (createdAt instanceof Date) {
    doc.createdAt = createdAt;
    doc.updatedAt = createdAt;
    await doc.save({ timestamps: false });
  } else {
    await doc.save();
  }
  return String(doc._id);
}
