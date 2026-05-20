import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import helmet from 'helmet';
import express from 'express';
import serverless from 'serverless-http';
import { AppModule } from '../src/app.module';

let cachedHandler: any;

async function bootstrap() {
  if (!cachedHandler) {
    const expressApp = express();

    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
      {
        logger: ['error', 'warn', 'log'],
      },
    );

    app.use(helmet());

    app.enableCors({
      origin: [
        'https://menu-flow-sl.vercel.app',
        'http://localhost:3000',
      ],
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    app.setGlobalPrefix('api/v1');

    await app.init();

    cachedHandler = serverless(expressApp);
  }

  return cachedHandler;
}

export default async function handler(req: any, res: any) {
  const server = await bootstrap();
  return server(req, res);
}