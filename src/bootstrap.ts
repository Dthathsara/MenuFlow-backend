import {
  BadRequestException,
  INestApplication,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import * as express from 'express';
import { mkdirSync } from 'fs';
import { join } from 'path';
import helmet from 'helmet';
import { MENU_IMAGE_UPLOAD_DIR } from './menu/menu-image-upload.config';
import { RESTAURANT_IMAGE_UPLOAD_ROOT } from './users/restaurant-image-upload.config';

export function getAllowedOrigins() {
  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.LOCAL_FRONTEND_URL,
    process.env.FRONTEND_PUBLIC_URL,
    ...(process.env.ALLOWED_ORIGINS?.split(',') ?? []),
  ]
    .map((origin) => origin?.trim().replace(/\/+$/, ''))
    .filter(Boolean) as string[];
}

export function configureNestApp(app: INestApplication) {
  const allowedOrigins = getAllowedOrigins();

  app.use(
    helmet({
      crossOriginResourcePolicy: {
        policy: 'cross-origin',
      },
    }),
  );
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ limit: '15mb', extended: true }));
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, ''))) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  mkdirSync(RESTAURANT_IMAGE_UPLOAD_ROOT, { recursive: true });
  mkdirSync(MENU_IMAGE_UPLOAD_DIR, { recursive: true });
  app.use('/uploads', (request, response, next) => {
    const origin = request.headers.origin;
    if (origin && allowedOrigins.includes(origin.replace(/\/+$/, ''))) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Vary', 'Origin');
    }
    next();
  });
  // Local uploads work for development. Vercel serverless file storage is not
  // persistent, so production images should move to S3/Cloudinary/Vercel Blob.
  app.use(
    '/uploads',
    express.static(join(process.cwd(), 'uploads'), {
      etag: true,
      lastModified: true,
      maxAge: '30d',
      immutable: true,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          message: flattenValidationErrors(errors),
          error: 'Bad Request',
        }),
    }),
  );

  app.setGlobalPrefix('api/v1');
}

function flattenValidationErrors(errors: ValidationError[]) {
  const messages: string[] = [];

  const collect = (error: ValidationError, parentPath = '') => {
    const propertyPath = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      messages.push(
        ...Object.values(error.constraints).map(
          (message) => `${propertyPath}: ${message}`,
        ),
      );
    }

    error.children?.forEach((child) => collect(child, propertyPath));
  };

  errors.forEach((error) => collect(error));
  return messages;
}
