import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Security headers
  app.use(helmet());
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ limit: '15mb', extended: true }));

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

  const port = process.env.PORT || 3001;

  try {
    await app.listen(port);
    console.log(`API running on port ${port}`);
  } catch (error: any) {
    if (error?.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the old backend process or change PORT.`);
      process.exit(1);
    }

    throw error;
  }
}
bootstrap();
