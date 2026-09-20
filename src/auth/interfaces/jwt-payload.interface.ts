import { Role } from '../../users/enums/role.enum';

/** Claims issued in access tokens by AuthService. */
export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
  jti: string;
  /** Server-side session that must remain active for this token to work. */
  sid: string;
  /** Per-user credential/session version for global invalidation. */
  ver: number;
  iat?: number;
  exp?: number;
}
