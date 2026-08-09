import { RawBodyRequest, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import type { Request } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    rawBody: true,
  });
  const config = app.get(ConfigService);

  app.use(json({
    limit: '1mb',
    verify: (request, _response, buffer) => {
      (request as RawBodyRequest<Request>).rawBody = Buffer.from(buffer);
    },
  }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.use(helmet());
  app.enableCors({
    origin: [config.getOrThrow<string>('APP_ORIGIN')],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    }),
  );
  app.enableShutdownHooks();

  const port = Number(config.getOrThrow<string>('PORT'));
  const host = config.getOrThrow<string>('HOST');
  await app.listen(port, host);
}

if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
