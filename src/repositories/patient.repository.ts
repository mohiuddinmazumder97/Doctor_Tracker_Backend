import type { QueryFilter, Types } from 'mongoose';
import { PatientModel, type Patient } from '../models/patient.model.js';
import { compact, createdAtFilter } from '../utils/query.js';
import { containsRegex } from '../utils/regex.js';
import type { CreatePatientInput, ListPatientsQuery, UpdatePatientInput } from '../validators/patient.validator.js';

export type PatientRecord = Patient & { _id: Types.ObjectId };

/** Only what the doctor "chip" in patient views needs. */
const DOCTOR_SUMMARY_FIELDS = 'name specialization hospital';

/** List views don't show the address — don't fetch it. */
const LIST_PROJECTION = {
  fullName: 1,
  email: 1,
  phone: 1,
  dateOfBirth: 1,
  gender: 1,
  condition: 1,
  doctor: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

export type PatientListQuery = Omit<ListPatientsQuery, 'doctorId'> & { doctorId?: string | undefined };

function buildListFilter(query: PatientListQuery): QueryFilter<Patient> {
  const search = query.search ? containsRegex(query.search) : undefined;
  return compact({
    doctor: query.doctorId,
    condition: query.condition,
    gender: query.gender,
    createdAt: createdAtFilter(query),
    $or: search ? [{ fullName: search }, { email: search }, { phone: search }] : undefined,
  }) as QueryFilter<Patient>;
}

export async function findPatients(query: PatientListQuery) {
  const filter = buildListFilter(query);
  const direction = query.order === 'asc' ? 1 : -1;

  const [items, total] = await Promise.all([
    PatientModel.find(filter, LIST_PROJECTION)
      .sort({ [query.sortBy]: direction, _id: direction })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      // populate batches all doctor ids of the page into ONE $in query (no N+1).
      .populate('doctor', DOCTOR_SUMMARY_FIELDS)
      .lean(),
    PatientModel.countDocuments(filter),
  ]);
  return { items, total };
}

export function findPatientById(id: string) {
  return PatientModel.findById(id).populate('doctor', `${DOCTOR_SUMMARY_FIELDS} email phone`).lean();
}

export function countPatientsForDoctor(doctorId: string) {
  return PatientModel.countDocuments({ doctor: doctorId });
}

export async function createPatient(input: CreatePatientInput) {
  const patient = await PatientModel.create(input);
  return findPatientById(String(patient._id));
}

export async function updatePatient(id: string, input: UpdatePatientInput) {
  // Dotted paths so a partial address update doesn't wipe the other address fields.
  const { address, ...rest } = input;
  const $set: Record<string, unknown> = { ...rest };
  if (address) for (const [key, value] of Object.entries(address)) $set[`address.${key}`] = value;

  return PatientModel.findByIdAndUpdate(id, { $set }, { returnDocument: 'after', runValidators: true })
    .populate('doctor', `${DOCTOR_SUMMARY_FIELDS} email phone`)
    .lean();
}

export function deletePatient(id: string) {
  return PatientModel.findByIdAndDelete(id, { projection: { _id: 1 } }).lean();
}
