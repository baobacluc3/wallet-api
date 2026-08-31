import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

export const IdempotencyKey = createParamDecorator(
  (_: unknown, context: ExecutionContext): string => {
    // Problem: payment retries must use one canonical key so a client cannot debit or credit twice.
    // Why here: this is HTTP-header concern, leaving wallet DTOs and services focused on money movement.
    // Nest resolves parameter decorators while binding controller arguments, after guards pass.
    const value = context.switchToHttp().getRequest().header('idempotency-key');
    if (!value || value.length > 128) {
      throw new BadRequestException(
        'Idempotency-Key header is required and must be at most 128 characters',
      );
    }
    return value;
  },
);
