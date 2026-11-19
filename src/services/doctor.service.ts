import * as doctorRepo from '../repositories/doctor.repository.js';
import * as patientRepo from '../repositories/patient.repository.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta } from '../utils/response.js';
import type { CreateDoctorInput, ListDoctorsQuery, UpdateDoctorInput } from '../validators/doctor.validator.js';
import type { PatientListQuery } from '../repositories/patient.repository.js';

export async function listDoctors(query: ListDoctorsQuery) {
  const { items, total } = await doctorRepo.findDoctors(query);
  return { items, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getDoctor(id: string) {
  const doctor = await doctorRepo.findDoctorById(id);
  if (!doctor) throw ApiError.notFound('Doctor');
  return doctor;
}

export async function createDoctor(input: CreateDoctorInput) {
  // Duplicate emails are rejected by the unique index (→ 409 in the error handler).
  const doctor = await doctorRepo.createDoctor(input);
  return { ...doctor, patientCount: 0 };
}

export async function updateDoctor(id: string, input: UpdateDoctorInput) {
  const doctor = await doctorRepo.updateDoctor(id, input);
  if (!doctor) throw ApiError.notFound('Doctor');
  return doctor;
}

/**
 * Deletion policy: a doctor with assigned patients cannot be deleted. Patients must be
 * reassigned (or deleted) first, so no patient is ever left without a valid doctor.
 */
export async function deleteDoctor(id: string) {
  if (!(await doctorRepo.doctorExists(id))) throw ApiError.notFound('Doctor');

  const patientCount = await patientRepo.countPatientsForDoctor(id);
  if (patientCount > 0) {
    throw ApiError.conflict(
      `This doctor has ${patientCount} assigned patient${patientCount === 1 ? '' : 's'}. Reassign or remove them before deleting.`,
      { patientCount },
    );
  }

  await doctorRepo.deleteDoctor(id);
}

export async function listDoctorPatients(doctorId: string, query: Omit<PatientListQuery, 'doctorId'>) {
  if (!(await doctorRepo.doctorExists(doctorId))) throw ApiError.notFound('Doctor');
  const { items, total } = await patientRepo.findPatients({ ...query, doctorId });
  return { items, meta: buildPaginationMeta(query.page, query.limit, total) };
}
