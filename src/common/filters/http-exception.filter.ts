import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

type DatabaseError = Error & { code?: string };
type ApiError = {
  statusCode: number;
  error: string;
  message: string | string[];
  details?: unknown;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const { statusCode, error, message, details } = this.toApiError(exception);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${request.method} ${request.path} failed [${request.requestContext?.requestId ?? 'unknown'}]`,
        stack,
      );
    }

    response.status(statusCode).json({
      statusCode,
      error,
      message,
      ...(details === undefined ? {} : { details }),
      path: request.path,
      requestId: request.requestContext?.requestId ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  private toApiError(exception: unknown): ApiError {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        return {
          statusCode,
          error: exception.name,
          message: payload,
        };
      }

      const objectPayload = payload as Record<string, unknown>;
      return {
        statusCode,
        error: String(objectPayload.error ?? exception.name),
        message:
          (objectPayload.message as string | string[]) ?? exception.message,
        details: objectPayload.details,
      };
    }

    const code = (exception as DatabaseError | undefined)?.code;
    if (code === '23505') {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'A record with these values already exists',
      };
    }
    if (code === '23503') {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'The requested change conflicts with related data',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    };
  }
}
