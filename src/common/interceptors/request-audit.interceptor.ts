import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { catchError, tap, throwError } from 'rxjs';
import type { Observable } from 'rxjs';

@Injectable()
export class RequestAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestAuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Problem: financial mutations need an audit trail with duration and request correlation.
    // Why here: an interceptor wraps successful and failed controller execution without polluting services.
    // Nest executes it after guards and around pipes/controller execution; its RxJS callbacks run on completion.
    const request = context.switchToHttp().getRequest<Request>();
    const startedAt = performance.now();

    return next.handle().pipe(
      tap(() => this.log(request, Math.round(performance.now() - startedAt))),
      catchError((error: unknown) => {
        this.log(request, Math.round(performance.now() - startedAt), error);
        return throwError(() => error);
      }),
    );
  }

  private log(request: Request, durationMs: number, error?: unknown): void {
    const status = request.res?.statusCode ?? (error ? 500 : 200);
    const message = `${request.method} ${request.originalUrl} ${status} ${durationMs}ms [${request.requestId ?? 'unknown'}]`;
    if (error) {
      this.logger.error(message);
      return;
    }
    this.logger.log(message);
  }
}
