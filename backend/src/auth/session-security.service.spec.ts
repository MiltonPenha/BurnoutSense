import { ConfigService } from '@nestjs/config';
import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { Request, Response } from 'express';
import { SessionSecurityService, durationMs } from './session-security.service';

const config = { FRONTEND_URL: 'http://localhost:3000', CSRF_SECRET: 'test-only-csrf-secret-with-over-32-characters' };
const settings = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as ConfigService;
describe('Cookie and CSRF boundary', () => {
  it('requires an exact HTTPS origin and independent secrets in production', () => {
    expect(() => new SessionSecurityService(settings({ NODE_ENV: 'production', ...config }))).toThrow();
    expect(() => new SessionSecurityService(settings({ NODE_ENV: 'production', FRONTEND_URL: 'https://burnoutsense.online', CSRF_SECRET: 'short' }))).toThrow();
    expect(() => new SessionSecurityService(settings({ NODE_ENV: 'production', FRONTEND_URL: 'https://burnoutsense.online', CSRF_SECRET: config.CSRF_SECRET, JWT_ACCESS_SECRET: config.CSRF_SECRET }))).toThrow('independent');
    expect(() => durationMs('forever')).toThrow(); expect(durationMs('30m')).toBe(1800000);
  });
  it('issues host-only production cookies with the matching clearing attributes', () => {
    const service = new SessionSecurityService(settings({ ...config, NODE_ENV: 'production', FRONTEND_URL: 'https://burnoutsense.online', JWT_ACCESS_SECRET: 'test-only-access-secret-with-over-32-characters' }));
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    const req = { cookies: {} } as Request;
    service.setSession(req, response as unknown as Response, { accessToken: 'test-access', refreshToken: 'session.test-refresh', refreshExpiresAt: new Date(Date.now() + 60000) });
    expect(response.cookie).toHaveBeenCalledWith('__Host-bs_access', 'test-access', expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' }));
    for (const [, , options] of response.cookie.mock.calls) expect(options.domain).toBeUndefined();
    service.clear(response as unknown as Response);
    expect(response.clearCookie).toHaveBeenCalledWith('__Host-bs_access', { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  });
  it('rejects missing/wrong CSRF and disallowed or missing origins', async () => {
    const security = new SessionSecurityService(new ConfigService(config));
    const app = express(); app.use(cookieParser()); app.use(security.protect);
    app.get('/csrf', (req, res) => res.json({ csrfToken: security.csrfToken(req, res) }));
    app.post('/change', (_req, res) => res.json({ ok: true }));
    const agent = request.agent(app), token = (await agent.get('/csrf')).body.csrfToken;
    await agent.post('/change').expect(403);
    await agent.post('/change').set('Origin', config.FRONTEND_URL).expect(403);
    await agent.post('/change').set('Origin', 'https://untrusted.example').set('X-CSRF-Token', token).expect(403);
    await agent.post('/change').set('Origin', config.FRONTEND_URL).set('X-CSRF-Token', 'wrong').expect(403);
    await agent.post('/change').set('Origin', config.FRONTEND_URL).set('X-CSRF-Token', token).expect(200);
  });
  it('recovers an old CSRF cookie after a secret change', async () => {
    const service = new SessionSecurityService(new ConfigService(config));
    const response = { cookie: jest.fn() };
    expect(service.csrfToken({ cookies: { bs_csrf: 'invalid-old-token' } } as unknown as Request, response as unknown as Response)).toEqual(expect.any(String));
  });
});
