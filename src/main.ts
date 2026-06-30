import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureNestApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  configureNestApp(app);

  const port = Number(process.env.PORT || process.env.APP_PORT) || 3001;
  await app.listen(port, '0.0.0.0');

  console.log(`API running on http://localhost:${port}/api/v1`);
}

bootstrap();
