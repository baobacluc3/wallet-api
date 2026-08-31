import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Problem: unvalidated or extra fields can reach financial services and corrupt assumptions.
  // Why here: this global pipe protects every DTO while allowing route-specific pipes for wallet IDs.
  // Nest executes global pipes after guards and before the relevant controller argument is bound.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
