import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestContext } from '../../common/interfaces/request-context.interface';

export type { RequestContext } from '../../common/interfaces/request-context.interface';

export const ClientCtx = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (
      request.requestContext ?? {
        requestId: 'unknown',
        ip: request.ip ?? null,
        userAgent: request.header('user-agent') ?? '',
        startedAt: Date.now(),
      }
    );
  },
);
