import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { CookieOptions, Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';

export function durationMs(value: string) {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match || Number(match[1]) < 1) throw new Error('Invalid session duration.');
  return Number(match[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]]!;
}

@Injectable()
export class SessionSecurityService {
  readonly production: boolean;
  readonly origin: string;
  readonly accessName: string;
  readonly refreshName: string;
  readonly accessMs: number;
  readonly refreshMs: number;
  private readonly csrfName: string;
  private readonly bootstrapName: string;
  private readonly options: CookieOptions;
  private readonly csrf: ReturnType<typeof doubleCsrf>;

  constructor(config: ConfigService) {
    this.production = config.get<string>('NODE_ENV') === 'production';
    this.origin = config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const url = new URL(this.origin);
    if (url.origin !== this.origin || this.production && url.protocol !== 'https:') throw new Error('FRONTEND_URL must be an exact origin, using HTTPS in production.');
    const secret = config.get<string>('CSRF_SECRET');
    if (this.production && (!secret || secret.length < 32)) throw new Error('Configure CSRF_SECRET with at least 32 random characters.');
    if (this.production && (config.get<string>('JWT_ACCESS_SECRET')?.length ?? 0) < 32) throw new Error('Configure a strong JWT_ACCESS_SECRET.');
    if (this.production && secret === config.get<string>('JWT_ACCESS_SECRET')) throw new Error('JWT_ACCESS_SECRET and CSRF_SECRET must be independent.');
    const prefix = this.production ? '__Host-' : '';
    this.accessName = prefix + 'bs_access'; this.refreshName = prefix + 'bs_refresh';
    this.csrfName = prefix + 'bs_csrf'; this.bootstrapName = prefix + 'bs_bootstrap';
    this.accessMs = durationMs(config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '30m');
    this.refreshMs = durationMs(config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d');
    this.options = { httpOnly: true, secure: this.production, sameSite: 'lax', path: '/' };
    const csrfSecret = secret || randomBytes(32).toString('hex');
    this.csrf = doubleCsrf({ getSecret: () => csrfSecret,
      getSessionIdentifier: request => this.read(request, this.refreshName)?.split('.')[0] || this.read(request, this.bootstrapName) || '',
      cookieName: this.csrfName, cookieOptions: this.options,
      getCsrfTokenFromRequest: request => request.get('X-CSRF-Token'),
    });
  }

  read(request: Request, name: string): string | undefined {
    const value: unknown = request.cookies?.[name];
    return typeof value === 'string' && value.length <= 4096 ? value : undefined;
  }

  csrfToken(request: Request, response: Response, overwrite = false) {
    if (!this.read(request, this.refreshName) && !this.read(request, this.bootstrapName)) {
      const nonce = randomBytes(32).toString('hex');
      request.cookies = { ...request.cookies, [this.bootstrapName]: nonce };
      response.cookie(this.bootstrapName, nonce, { ...this.options, maxAge: this.accessMs });
    }
    try { return this.csrf.generateCsrfToken(request, response, { overwrite }); }
    catch { return this.csrf.generateCsrfToken(request, response, { overwrite: true }); }
  }

  protect = (request: Request, response: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
    if (request.get('Origin') !== this.origin) return response.status(403).json({ code: 'ORIGIN_INVALID', message: 'Origem da requisição não permitida.' });
    this.csrf.doubleCsrfProtection(request, response, error => error
      ? response.status(403).json({ code: 'CSRF_INVALID', message: 'Atualize a página e tente novamente.' }) : next());
  };

  setSession(request: Request, response: Response, tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date }) {
    response.cookie(this.accessName, tokens.accessToken, { ...this.options, maxAge: this.accessMs });
    response.cookie(this.refreshName, tokens.refreshToken, { ...this.options, maxAge: Math.max(0, tokens.refreshExpiresAt.getTime() - Date.now()) });
    const previousId = this.read(request, this.refreshName)?.split('.')[0];
    request.cookies = { ...request.cookies, [this.refreshName]: tokens.refreshToken };
    return this.csrfToken(request, response, previousId !== tokens.refreshToken.split('.')[0]);
  }

  clear(response: Response) {
    for (const name of [this.accessName, this.refreshName, this.csrfName, this.bootstrapName]) response.clearCookie(name, this.options);
  }
}
