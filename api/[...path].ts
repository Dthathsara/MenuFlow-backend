import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import { AppModule } from '../src/app.module';
import { configureNestApp } from '../src/bootstrap';

let cachedServer: express.Express | undefined;

async function bootstrapServer() {
  if (cachedServer) {
    return cachedServer;
  }

  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ['error', 'warn', 'log'],
  });

  configureNestApp(app);
  await app.init();

  cachedServer = server;
  return server;
}

export default async function handler(request: any, response: any) {
  const server = await bootstrapServer();
  return server(request, response);
}
