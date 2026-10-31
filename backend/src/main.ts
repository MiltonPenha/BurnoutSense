import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import type { ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);

  app.use('/esbeu-assessments', (_request: unknown, response: { setHeader: (key: string, value: string) => void }, next: () => void) => {
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

  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000',
    credentials: true,
  });

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
  await app.listen(port);
}

bootstrap();
