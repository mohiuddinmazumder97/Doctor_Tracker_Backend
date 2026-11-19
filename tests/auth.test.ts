import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AUTH_COOKIE } from '../src/utils/cookies.js';
import { signAccessToken } from '../src/utils/jwt.js';
import { ADMIN, app, createAdmin, loginAgent } from './helpers.js';

function authCookie(res: request.Response): string | undefined {
  const raw: unknown = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw.find((c: string) => c.startsWith(`${AUTH_COOKIE}=`)) : undefined;
}

describe('POST /api/auth/login', () => {
  it('sets an HTTP-only cookie and never returns the token in the body', async () => {
    await createAdmin();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email.toUpperCase(), password: ADMIN.password })
      .expect(200);

    expect(res.body).toEqual({
      success: true,
      data: { admin: { _id: expect.any(String), name: ADMIN.name, email: ADMIN.email, role: 'admin' } },
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const cookie = authCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('returns the same 401 for a wrong password and an unknown email', async () => {
    await createAdmin();
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'nope' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'ghost@test.dev', password: 'nope' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(authCookie(wrongPassword)).toBeUndefined();
  });

  it('validates the request body', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        { path: 'email', message: 'Enter a valid email address' },
        { path: 'password', message: 'Password is required' },
      ]),
    );
  });

  it('rate-limits repeated failed attempts', async () => {
    const attempt = () => request(app).post('/api/auth/login').send({ email: 'brute@test.dev', password: 'guess' });
    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current admin for a valid session', async () => {
    const agent = await loginAgent();
    const res = await agent.get('/api/auth/me').expect(200);
    expect(res.body.data.admin.email).toBe(ADMIN.email);
  });

  it('rejects missing, tampered and orphaned tokens', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Cookie', `${AUTH_COOKIE}=not.a.jwt`).expect(401);

    // Valid signature, but the admin no longer exists.
    const orphan = signAccessToken({ adminId: '507f1f77bcf86cd799439011', role: 'admin' });
    await request(app).get('/api/auth/me').set('Cookie', `${AUTH_COOKIE}=${orphan}`).expect(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie so the session ends', async () => {
    const agent = await loginAgent();
    const res = await agent.post('/api/auth/logout').expect(204);
    expect(authCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    await agent.get('/api/auth/me').expect(401);
  });
});

describe('protected API', () => {
  it('blocks unauthenticated access to everything except auth and health', async () => {
    await request(app).get('/api/health').expect(200);
    const res = await request(app).get('/api/doctors').expect(401);
    expect(res.body).toEqual({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  });
});
