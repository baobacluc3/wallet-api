import { Request, Response, NextFunction } from 'express';
import { NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';

export class RequestIdPracticeMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const requestId = req.header('X-Request-Id') ?? randomUUID();
    (req as Request & { requestId: string }).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(
        `[RESPONSE] - ${duration} ms - ${requestId} - ${req.method} - ${req.originalUrl} `,
      );
    });
    next();
  }
}
