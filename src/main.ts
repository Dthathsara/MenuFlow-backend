import { NestFactory, Reflector } from '@nestjs/core';
import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { mkdirSync } from 'fs';
import { join } from 'path';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { RESTAURANT_IMAGE_UPLOAD_ROOT } from './users/restaurant-image-upload.config';

async function bootstrap() {
  console.log('BOOTSTRAP START');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Security headers
  app.use(
    helmet({
      crossOriginResourcePolicy: {
        policy: 'cross-origin',
      },
    }),
  );
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ limit: '15mb', extended: true }));
  mkdirSync(RESTAURANT_IMAGE_UPLOAD_ROOT, { recursive: true });
  app.use(
    '/uploads',
    express.static(join(process.cwd(), 'uploads')),
  );
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Global validation — whitelist strips unknown fields
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Strip unknown properties
      forbidNonWhitelisted: true, // Error on unknown properties
      transform: true,            // Auto-transform to DTO types
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          message: flattenValidationErrors(errors),
          error: 'Bad Request',
        }),
    }),
  );

  // API versioning prefix
  app.setGlobalPrefix('api/v1');

  const port = Number(process.env.PORT) || 3001;

  try {
    console.log('BEFORE LISTEN');
    await app.listen(port, '0.0.0.0');
    console.log('AFTER LISTEN');
    console.log(`API running on http://localhost:${port}/api/v1`);
  } catch (error: any) {
    if (error?.code === 'EADDRINUSE') {
      console.error(
        `Port ${port} is already in use. Stop the old backend process or change PORT.`,
      );
      process.exit(1);
    }

    throw error;
  }
}
bootstrap();

function flattenValidationErrors(errors: ValidationError[]) {
  const messages: string[] = [];

  const collect = (error: ValidationError, parentPath = '') => {
    const propertyPath = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      messages.push(
        ...Object.values(error.constraints).map((message) => `${propertyPath}: ${message}`),
      );
    }

    error.children?.forEach((child) => collect(child, propertyPath));
  };

  errors.forEach((error) => collect(error));
  return messages;
}

