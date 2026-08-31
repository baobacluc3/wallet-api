import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    clientIp?: string;
    userAgent?: string;
  }
}
