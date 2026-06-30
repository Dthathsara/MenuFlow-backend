import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import express = require('express');
import { mkdirSync } from 'fs';
import { join } from 'path';
import helmet from 'helmet';
import { MENU_IMAGE_UPLOAD_DIR } from './menu/menu-image-upload.config';
import { RESTAURANT_IMAGE_UPLOAD_ROOT } from './users/restaurant-image-upload.config';

export function configureNestApp(app: NestExpressApplication) {
  const allowedOrigins = buildAllowedOrigins();

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
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  mkdirSync(RESTAURANT_IMAGE_UPLOAD_ROOT, { recursive: true });
  mkdirSync(MENU_IMAGE_UPLOAD_DIR, { recursive: true });

  app.use('/uploads', (request, response, next) => {
    const origin = request.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Vary', 'Origin');
    }

    next();
  });

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

function buildAllowedOrigins() {
  const defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.11.1:3000',
  ];

  const frontendUrl = process.env.FRONTEND_PUBLIC_URL;
  const extraOrigins = process.env.ALLOWED_ORIGINS;

  return Array.from(
    new Set([
      ...defaults,
      ...(frontendUrl ? [frontendUrl] : []),
      ...(extraOrigins
        ? extraOrigins
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean)
        : []),
    ]),
  );
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
