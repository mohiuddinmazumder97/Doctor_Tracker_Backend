import type { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service.js';
import { sendSuccess } from '../utils/response.js';
import { parse } from '../utils/validate.js';
import {
  distributionQuerySchema,
  overviewQuerySchema,
  rangeQuerySchema,
  trendsQuerySchema,
} from '../validators/dashboard.validator.js';

export async function overview(req: Request, res: Response) {
  sendSuccess(res, await dashboardService.getOverview(parse(overviewQuerySchema, req.query)));
}

export async function patientTrends(req: Request, res: Response) {
  sendSuccess(res, await dashboardService.getPatientTrends(parse(trendsQuerySchema, req.query)));
}

export async function doctorDistribution(req: Request, res: Response) {
  sendSuccess(res, await dashboardService.getDoctorDistribution(parse(distributionQuerySchema, req.query)));
}

export async function conditionDistribution(req: Request, res: Response) {
  sendSuccess(res, await dashboardService.getConditionDistribution(parse(rangeQuerySchema, req.query)));
}

export async function specializationDistribution(req: Request, res: Response) {
  sendSuccess(res, await dashboardService.getSpecializationDistribution(parse(rangeQuerySchema, req.query)));
}
