import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface RequestContext {
  ip: string;
  userAgent: string;
}

export const ClientCtx = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return {
      ip: request.ip ?? '',
      userAgent: (request.header['user-agent'] as string) ?? '',
    };
  },
);
