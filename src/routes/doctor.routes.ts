import { Router } from 'express';
import * as doctorController from '../controllers/doctor.controller.js';

export const doctorRouter = Router();

doctorRouter.route('/').get(doctorController.list).post(doctorController.create);
doctorRouter
  .route('/:id')
  .get(doctorController.getById)
  .patch(doctorController.update)
  .delete(doctorController.remove);
doctorRouter.get('/:id/patients', doctorController.listPatients);
