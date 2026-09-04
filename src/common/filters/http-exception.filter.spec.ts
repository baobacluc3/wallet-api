import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  it('returns a consistent client-safe error with a request ID', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({
          method: 'GET',
          path: '/wallets/4',
          requestContext: { requestId: 'request-123' },
        }),
      }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new BadRequestException('Invalid input'),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid input',
        path: '/wallets/4',
        requestId: 'request-123',
      }),
    );
  });

  it('preserves explicit validation details without exposing unexpected errors', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({
          method: 'POST',
          path: '/auth/login',
          requestContext: { requestId: 'request-456' },
        }),
      }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new BadRequestException({
        message: 'Validation failed',
        details: [{ field: 'email', errors: ['email must be an email'] }],
      }),
      host,
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Validation failed',
        details: [{ field: 'email', errors: ['email must be an email'] }],
      }),
    );
  });
});
