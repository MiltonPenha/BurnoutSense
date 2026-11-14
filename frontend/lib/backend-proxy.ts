type ProxySettings = { target?: string; secret?: string; origin?: string };
const MAX_BODY = 5 * 1024 * 1024;
const ALLOWED_ROOTS = new Set(['auth', 'users', 'daily-check-ins', 'esbeu-assessments', 'guidance', 'assessments', 'results', 'status', 'health']);
const error = (status: number, message: string) => Response.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });

async function readBody(request: Request) {
  if (!request.body) return undefined;
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new Error('body-limit');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); throw new Error('body-limit'); }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return body;
}

export async function proxyBackend(request: Request, segments: string[], settings: ProxySettings, transport: typeof fetch = fetch) {
  if (!segments.length || !ALLOWED_ROOTS.has(segments[0]) || segments.some(value => !/^[A-Za-z0-9_-]+$/.test(value))) return error(404, 'Recurso não encontrado.');
  let target: URL, origin: string;
  try {
    target = new URL(settings.target ?? '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
    const quickTunnel = /^[a-z0-9-]+\.trycloudflare\.com$/.test(target.hostname);
    if (target.username || target.password || target.search || target.hash || target.pathname !== '/' || !(quickTunnel && target.protocol === 'https:' || local && target.protocol === 'http:')) throw new Error();
    if (!settings.secret || settings.secret.length < 32) throw new Error();
    origin = new URL(settings.origin ?? '').origin;
    if (origin !== settings.origin) throw new Error();
  } catch { return error(503, 'A conexão com o serviço ainda não foi configurada.'); }

  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  if (mutation && request.headers.get('origin') !== origin) return error(403, 'Origem da requisição não permitida.');
  target.pathname = '/' + segments.map(encodeURIComponent).join('/');
  target.search = new URL(request.url).search;
  const headers = new Headers({ 'X-Demo-Gateway': settings.secret!, 'Accept': 'application/json' });
  for (const name of ['content-type', 'cookie', 'x-csrf-token', 'origin']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let body: Uint8Array | undefined;
  try { if (mutation) body = await readBody(request); }
  catch { return error(413, 'A requisição é muito grande.'); }
  try {
    const upstream = await transport(target, { method: request.method, headers, body: body as BodyInit | undefined,
      cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(45000) });
    if (upstream.status >= 300 && upstream.status < 400) return error(502, 'Não foi possível conectar ao serviço.');
    const result = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['content-type', 'retry-after']) { const value = upstream.headers.get(name); if (value) result.set(name, value); }
    for (const cookie of upstream.headers.getSetCookie()) result.append('Set-Cookie', cookie);
    return new Response(request.method === 'HEAD' || [204, 205, 304].includes(upstream.status) ? null : upstream.body, { status: upstream.status, headers: result });
  } catch { return error(503, 'O serviço está temporariamente indisponível. Tente novamente em instantes.'); }
}
