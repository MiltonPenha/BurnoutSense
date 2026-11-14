import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import type { ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { SessionSecurityService } from './auth/session-security.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);
  const security = app.get(SessionSecurityService);
  if (configService.get<string>('TRUST_PROXY_HOPS')) {
    const hops = Number(configService.get<string>('TRUST_PROXY_HOPS'));
    if (!Number.isInteger(hops) || hops < 1 || hops > 5) throw new Error('Invalid TRUST_PROXY_HOPS.');
    app.getHttpAdapter().getInstance().set('trust proxy', hops);
  }

  app.use(['/esbeu-assessments', '/daily-check-ins'], (_request: unknown, response: { setHeader: (key: string, value: string) => void }, next: () => void) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  }, json({ limit: '256kb' }));
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));
  const bodyErrors: ErrorRequestHandler = (error: { type?: string }, _request, response, next) => {
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      const status = error.type === 'entity.too.large' ? 413 : 400;
      response.status(status).json({ statusCode: status, message: 'Corpo da requisição inválido ou muito grande.' });
      return;
    }
    next(error);
  };
  app.use(bodyErrors);
  app.use(helmet());
  app.use(cookieParser());
  app.use(['/auth', '/users'], (_req: unknown, res: { setHeader: (key: string, value: string) => void }, next: () => void) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  app.enableCors({
    origin: security.origin,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  });
  app.use(security.protect);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
      exceptionFactory: () => new BadRequestException('Confira os campos obrigatórios e o formato da requisição.'),
    }),
  );

  const port = configService.get<number>('PORT') ?? 3001;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
