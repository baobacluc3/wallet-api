import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { isIP } from 'net';
import { NextFunction, Request, Response } from 'express';
import { RequestContext } from '../interfaces/request-context.interface';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const providedRequestId = req.header('x-request-id');
    // Correlation IDs are not trusted security inputs. Only retain a bounded,
    // printable value so logs cannot be polluted with unbounded client input.
    const requestId =
      providedRequestId && /^[A-Za-z0-9._-]{8,128}$/.test(providedRequestId)
        ? providedRequestId
        : randomUUID();
    const rawIp = req.ip;
    const context: RequestContext = {
      requestId,
      ip: rawIp && isIP(rawIp) ? rawIp : null,
      userAgent: this.sanitizeUserAgent(req.header('user-agent')),
      startedAt: Date.now(),
    };

    req.requestContext = context;
    res.setHeader('x-request-id', requestId);
    // Set this before guards run so failed authentication responses are not
    // accidentally cached by a browser or intermediary.
    res.setHeader('cache-control', 'no-store');
    next();
  }

  private sanitizeUserAgent(value: string | undefined): string {
    return (value ?? '')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .slice(0, 512);
  }
}
