import request from 'supertest';
import { createApp } from '../src/app.js';
import { AdminModel } from '../src/models/admin.model.js';
import { hashPassword } from '../src/services/auth.service.js';

export const app = createApp();

export const ADMIN = { name: 'Test Admin', email: 'admin@test.dev', password: 'Secret@123' };

export async function createAdmin() {
  return AdminModel.create({
    name: ADMIN.name,
    email: ADMIN.email,
    passwordHash: await hashPassword(ADMIN.password),
  });
}

/** Creates the admin, logs in, and returns a supertest agent that carries the auth cookie. */
export async function loginAgent() {
  await createAdmin();
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: ADMIN.email, password: ADMIN.password }).expect(200);
  return agent;
}
