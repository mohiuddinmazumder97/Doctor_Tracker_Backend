import * as doctorRepo from '../repositories/doctor.repository.js';
import * as patientRepo from '../repositories/patient.repository.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta } from '../utils/response.js';
import type { CreatePatientInput, ListPatientsQuery, UpdatePatientInput } from '../validators/patient.validator.js';

/** Every patient must reference an existing doctor. */
async function assertDoctorExists(doctorId: string) {
  if (!(await doctorRepo.doctorExists(doctorId))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Assigned doctor does not exist', [
      { path: 'doctor', message: 'Select an existing doctor' },
    ]);
  }
}

export async function listPatients(query: ListPatientsQuery) {
  const { items, total } = await patientRepo.findPatients(query);
  return { items, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getPatient(id: string) {
  const patient = await patientRepo.findPatientById(id);
  if (!patient) throw ApiError.notFound('Patient');
  return patient;
}

export async function createPatient(input: CreatePatientInput) {
  await assertDoctorExists(input.doctor);
  return patientRepo.createPatient(input);
}

export async function updatePatient(id: string, input: UpdatePatientInput) {
  if (input.doctor) await assertDoctorExists(input.doctor);
  const patient = await patientRepo.updatePatient(id, input);
  if (!patient) throw ApiError.notFound('Patient');
  return patient;
}

export async function deletePatient(id: string) {
  const deleted = await patientRepo.deletePatient(id);
  if (!deleted) throw ApiError.notFound('Patient');
}
