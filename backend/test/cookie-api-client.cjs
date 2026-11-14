const { CookieJar } = require('tough-cookie');

class CookieApiClient {
  constructor(base, origin = process.env.BURNOUTSENSE_E2E_BASE_URL || 'http://localhost:3000') {
    this.base = base; this.origin = origin; this.jar = new CookieJar(); this.csrf = null;
  }
  async raw(route, options = {}) {
    const url = new URL(route, this.base).href;
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60000),
      headers: { 'Content-Type': 'application/json', Cookie: this.jar.getCookieStringSync(url), ...options.headers } });
    for (const cookie of response.headers.getSetCookie()) this.jar.setCookieSync(cookie, url);
    const data = await response.clone().json().catch(() => null);
    if (data?.csrfToken) this.csrf = data.csrfToken;
    return response;
  }
  async request(route, method = 'GET', body) {
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (mutation && !this.csrf) await this.raw('/auth/csrf');
    const send = () => this.raw(route, { method, headers: mutation ? { Origin: this.origin, 'X-CSRF-Token': this.csrf } : {}, body: body ? JSON.stringify(body) : undefined });
    let response = await send();
    if (response.status === 403 && (await response.clone().json()).code === 'CSRF_INVALID') { this.csrf = null; await this.raw('/auth/csrf'); response = await send(); }
    return response;
  }
  async json(route, method = 'GET', body) {
    const response = await this.request(route, method, body);
    if (!response.ok) throw new Error(route + ': HTTP ' + response.status);
    return response.status === 204 ? null : response.json();
  }
  async addToBrowser(context) {
    const cookies = this.jar.getCookiesSync(this.base).map(cookie => ({ name: cookie.key, value: cookie.value, domain: cookie.domain,
      path: cookie.path, httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: 'Lax',
      ...(cookie.expires instanceof Date ? { expires: cookie.expires.getTime() / 1000 } : {}) }));
    await context.addCookies(cookies);
  }
}

function createTestTransport(base, origin) {
  const clients = new Map();
  return {
    clients,
    async request(route, method = 'GET', body, ownerId) {
      const authenticating = ['/auth/register', '/auth/login'].includes(route);
      const client = !authenticating && ownerId && clients.get(ownerId) || new CookieApiClient(base, origin);
      const response = await client.request(route, method, body);
      if (['/auth/register', '/auth/login'].includes(route) && response.ok) {
        const result = await response.clone().json(); clients.set(result.user.id, client);
      }
      return response;
    },
    addToBrowser(context, ownerId) { return clients.get(ownerId).addToBrowser(context); },
  };
}
module.exports = { CookieApiClient, createTestTransport };
