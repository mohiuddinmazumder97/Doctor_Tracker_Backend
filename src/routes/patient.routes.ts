import { Router } from 'express';
import * as patientController from '../controllers/patient.controller.js';

export const patientRouter = Router();

patientRouter.route('/').get(patientController.list).post(patientController.create);
patientRouter
  .route('/:id')
  .get(patientController.getById)
  .patch(patientController.update)
  .delete(patientController.remove);
