import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller.js';

export const dashboardRouter = Router();

dashboardRouter.get('/overview', dashboardController.overview);
dashboardRouter.get('/patient-trends', dashboardController.patientTrends);
dashboardRouter.get('/doctor-distribution', dashboardController.doctorDistribution);
dashboardRouter.get('/condition-distribution', dashboardController.conditionDistribution);
dashboardRouter.get('/specialization-distribution', dashboardController.specializationDistribution);
