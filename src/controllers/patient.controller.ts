import type { Request, Response } from 'express';
import * as patientService from '../services/patient.service.js';
import { sendSuccess } from '../utils/response.js';
import { parse } from '../utils/validate.js';
import { idParamsSchema } from '../validators/common.validator.js';
import { createPatientSchema, listPatientsQuerySchema, updatePatientSchema } from '../validators/patient.validator.js';

export async function list(req: Request, res: Response) {
  const query = parse(listPatientsQuerySchema, req.query);
  const { items, meta } = await patientService.listPatients(query);
  sendSuccess(res, items, 200, meta);
}

export async function getById(req: Request, res: Response) {
  const { id } = parse(idParamsSchema, req.params);
  sendSuccess(res, await patientService.getPatient(id));
}

export async function create(req: Request, res: Response) {
  const input = parse(createPatientSchema, req.body);
  sendSuccess(res, await patientService.createPatient(input), 201);
}

export async function update(req: Request, res: Response) {
  const { id } = parse(idParamsSchema, req.params);
  const input = parse(updatePatientSchema, req.body);
  sendSuccess(res, await patientService.updatePatient(id, input));
}

export async function remove(req: Request, res: Response) {
  const { id } = parse(idParamsSchema, req.params);
  await patientService.deletePatient(id);
  res.status(204).end();
}
