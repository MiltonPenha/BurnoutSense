import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyBackend } from '../lib/backend-proxy.ts';

const settings = { target: 'https://fictional.trycloudflare.com', secret: 'test-only-gateway-secret-with-over-32-characters', origin: 'https://burnoutsense.online' };
const request = (path = '/api/auth/login', options = {}) => new Request(settings.origin + path, options);
test('proxy preserves method, query, body, CSRF and cookies but never trusts client gateway headers', async () => {
  let captured;
  const reply = await proxyBackend(request('/api/auth/login?sample=1', { method: 'POST', headers: { Origin: settings.origin, 'Content-Type': 'application/json', Cookie: 'session=fictional', 'X-CSRF-Token': 'public-csrf', 'X-Demo-Gateway': 'forged', Authorization: 'Bearer forged', 'X-Forwarded-For': 'forged' }, body: '{"test":true}' }), ['auth', 'login'], settings, async (url, options) => {
    captured = { url, options }; return Response.json({ user: { id: 'fictional' } });
  });
  assert.equal(reply.status, 200); assert.equal(captured.url.href, settings.target + '/auth/login?sample=1');
  assert.equal(captured.options.method, 'POST'); assert.equal(new TextDecoder().decode(captured.options.body), '{"test":true}');
  for (const [key, value] of [['Origin', settings.origin], ['Cookie', 'session=fictional'], ['X-CSRF-Token', 'public-csrf'], ['X-Demo-Gateway', settings.secret]]) assert.equal(captured.options.headers.get(key), value);
  assert.equal(captured.options.headers.has('authorization'), false); assert.equal(captured.options.headers.has('x-forwarded-for'), false);
  assert.equal(reply.headers.get('cache-control'), 'no-store'); assert.equal((await reply.text()).includes(settings.secret), false);
});
test('proxy forwards multiple HttpOnly production cookies independently and preserves retry-after', async () => {
  const cookies = ['__Host-bs_access=fictional; Path=/; HttpOnly; Secure; SameSite=Lax', '__Host-bs_refresh=fictional; Path=/; HttpOnly; Secure; SameSite=Lax'];
  const reply = await proxyBackend(request('/api/auth/csrf'), ['auth', 'csrf'], settings, async () => {
    const headers = new Headers({ 'Retry-After': '60' }); for (const cookie of cookies) headers.append('Set-Cookie', cookie);
    return new Response('{}', { status: 429, headers });
  });
  assert.deepEqual(reply.headers.getSetCookie(), cookies); assert.equal(reply.headers.get('retry-after'), '60'); assert.equal(reply.status, 429);
});
test('proxy blocks missing or foreign origins before sending any mutation upstream', async () => {
  for (const origin of [undefined, 'https://untrusted.invalid']) {
    let called = false;
    const reply = await proxyBackend(request(undefined, { method: 'POST', headers: origin ? { Origin: origin } : {} }), ['auth', 'login'], settings, async () => { called = true; return new Response(); });
    assert.equal(reply.status, 403); assert.equal(called, false);
  }
});
test('proxy rejects traversal, unrelated paths and unsafe/missing configuration', async () => {
  for (const segments of [['auth', '..'], ['auth', 'x/y'], ['v1', 'predict'], ['auth', '%2e%2e']]) assert.equal((await proxyBackend(request(), segments, settings)).status, 404);
  for (const target of [undefined, 'http://external.invalid', 'https://unrelated.invalid', 'https://user:password@fictional.trycloudflare.com', 'https://fictional.trycloudflare.com/path', 'https://fictional.trycloudflare.com/?secret=x']) assert.equal((await proxyBackend(request(), ['auth'], { ...settings, target })).status, 503);
  assert.equal((await proxyBackend(request(), ['auth'], { ...settings, secret: '' })).status, 503);
});
test('proxy does not follow redirects or leak network errors or private destinations', async () => {
  for (const transport of [async () => Response.redirect('https://untrusted.invalid'), async () => { throw new Error('private network details'); }]) {
    const reply = await proxyBackend(request(), ['health'], settings, transport);
    assert.ok([502, 503].includes(reply.status)); const body = await reply.text();
    assert.equal(body.includes(settings.target), false); assert.equal(body.includes('private network details'), false); assert.equal(body.includes(settings.secret), false);
  }
});
test('oversized mutation bodies are rejected without reaching the API', async () => {
  const reply = await proxyBackend(request(undefined, { method: 'POST', headers: { Origin: settings.origin, 'Content-Length': String(6 * 1024 * 1024) }, body: 'too large' }), ['users', 'me'], settings);
  assert.equal(reply.status, 413);
});
