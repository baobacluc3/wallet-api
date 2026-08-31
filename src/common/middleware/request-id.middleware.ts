import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Problem: a money operation cannot be correlated across client responses, logs, and errors.
    // Why here: every HTTP route needs the same trusted request identifier before Nest handles it.
    // Nest executes middleware first, before guards, interceptors, pipes, and the controller.
    const suppliedId = req.header('x-request-id');
    const requestId = this.isSafeRequestId(suppliedId)
      ? suppliedId
      : randomUUID();

    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  }

  private isSafeRequestId(value: string | undefined): value is string {
    return Boolean(value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value));
  }
}
