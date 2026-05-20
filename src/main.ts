import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Security headers
  app.use(helmet());

  // CORS — restrict to known origins in production
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
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
    }),
  );

  // API versioning prefix
  app.setGlobalPrefix('api/v1');

  const port = process.env.APP_PORT || 3000;
  await app.listen(port);
  console.log(`API running on port ${port}`);
}
bootstrap();