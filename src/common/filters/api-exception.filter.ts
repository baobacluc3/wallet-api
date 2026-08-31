import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // Problem: clients receive inconsistent errors and operators cannot correlate a failed payment request.
    // Why here: one global boundary can safely normalize errors from guards, pipes, and services.
    // Nest executes exception filters last, after an unhandled error escapes the request pipeline.
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : undefined;
    const details = this.getDetails(exceptionResponse);
    const message = this.getMessage(exceptionResponse, isHttpException);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl} failed [${request.requestId ?? 'unknown'}]`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.originalUrl} returned ${status} [${request.requestId ?? 'unknown'}]`,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(details ? { details } : {}),
      requestId: request.requestId ?? null,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }

  private getMessage(
    response: string | object | undefined,
    isHttpException: boolean,
  ): string {
    if (typeof response === 'string') return response;
    if (response && 'message' in response) {
      const message = response.message;
      return Array.isArray(message)
        ? 'Request validation failed'
        : String(message);
    }
    return isHttpException ? 'Request failed' : 'Internal server error';
  }

  private getDetails(
    response: string | object | undefined,
  ): string[] | undefined {
    if (response && typeof response === 'object' && 'message' in response) {
      const message = response.message;
      return Array.isArray(message) ? message.map(String) : undefined;
    }
    return undefined;
  }
}
