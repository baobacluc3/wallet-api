/** Request metadata that is safe to use for logging and audit events. */
export interface RequestContext {
  requestId: string;
  ip: string | null;
  userAgent: string;
  startedAt: number;
}
