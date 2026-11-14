import { proxyBackend } from '@/lib/backend-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyBackend(request, (await context.params).path, {
    target: process.env.BACKEND_PROXY_URL,
    secret: process.env.DEMO_GATEWAY_SECRET,
    origin: process.env.DEMO_APP_ORIGIN,
  });
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as HEAD, handler as OPTIONS };
