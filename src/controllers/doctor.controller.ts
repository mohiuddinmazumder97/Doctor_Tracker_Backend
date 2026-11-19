import type { Request, Response } from 'express';
import * as doctorService from '../services/doctor.service.js';
import { sendSuccess } from '../utils/response.js';
import { parse } from '../utils/validate.js';
import { idParamsSchema } from '../validators/common.validator.js';
import { createDoctorSchema, listDoctorsQuerySchema, updateDoctorSchema } from '../validators/doctor.validator.js';
import { listDoctorPatientsQuerySchema } from '../validators/patient.validator.js';

export async function list(req: Request, res: Response) {
  const query = parse(listDoctorsQuerySchema, req.query);
  const { items, meta } = await doctorService.listDoctors(query);
  sendSuccess(res, items, 200, meta);
}

export async function getById(req: Request, res: Response) {
  const { id } = parse(idParamsSchema, req.params);
  sendSuccess(res, await doctorService.getDoctor(id));
}

export async function create(req: Request, res: Response) {
  const input = parse(createDoctorSchema, req.body);
  sendSuccess(res, await doctorService.createDoctor(input), 201);
}

export async function update(req: Request, res: Response) {
  const { id } = parse(idParamsSchema, req.params);
  const input = parse(updateDoctorSchema, req.body);
  sendSuccess(res, await doctorService.updateDoctor(id, input));
}

export async function remove(req: Request, res: Response) {
  const { id } = parse(idParamsSchema, req.params);
  await doctorService.deleteDoctor(id);
  res.status(204).end();
}

export async function listPatients(req: Request, res: Response) {
  const { id } = parse(idParamsSchema, req.params);
  const query = parse(listDoctorPatientsQuerySchema, req.query);
  const { items, meta } = await doctorService.listDoctorPatients(id, query);
  sendSuccess(res, items, 200, meta);
}
