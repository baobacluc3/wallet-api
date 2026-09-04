import 'express';
import { RequestContext } from '../common/interfaces/request-context.interface';

declare module 'express-serve-static-core' {
  interface Request {
    requestContext?: RequestContext;
  }
}
