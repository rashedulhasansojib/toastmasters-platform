import 'reflect-metadata';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { Env } from '@toastmasters/config';
import { AppModule } from './app.module';
import { ENV } from './config/config.module';
import { ProblemJsonFilter } from './common/filters/problem-json.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const env = app.get<Env>(ENV);

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new ProblemJsonFilter());
  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
}

void bootstrap();
