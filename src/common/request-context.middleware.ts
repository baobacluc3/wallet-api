import { NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

export class RequestContextPractice implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const requestId = req.header('X-Request-Id') ?? randomUUID();
    const clientIp = req.ip;
    const userAgent = req.header('user-agent');

    //(req as Request & { requestId: string }).requestId = requestId;
    //(req as Request & { clientIp: string | undefined }).clientIp = clientIp;
    //(req as Request & { userAgent: string | undefined }).userAgent = userAgent;
    req.requestId = requestId;
    req.userAgent = userAgent;
    req.clientIp = clientIp;

    res.setHeader('X-Request-Id', requestId);
    console.log(`[request] ${requestId} ${req.method} ${req.originalUrl}`);

    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(
        `[response] ${requestId} ${res.statusCode} ${duration}ms ${clientIp} ${userAgent}`,
      );
    });

    next();
  }
}
