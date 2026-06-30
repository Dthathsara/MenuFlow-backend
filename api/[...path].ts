import express = require('express');
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureNestApp } from '../src/bootstrap';

let cachedServer: express.Express | null = null;

async function bootstrapServer() {
  if (cachedServer) {
    return cachedServer;
  }

  const expressServer = express();

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressServer),
    {
      logger: ['error', 'warn', 'log'],
    },
  );

  configureNestApp(app);
  await app.init();

  cachedServer = expressServer;
  return expressServer;
}

export default async function handler(req: any, res: any) {
  const server = await bootstrapServer();
  return server(req, res);
}
