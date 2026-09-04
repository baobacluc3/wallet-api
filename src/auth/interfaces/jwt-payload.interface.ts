import { Role } from '../../users/enums/role.enum';

/** Claims issued in access tokens by AuthService. */
export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
  jti: string;
  iat?: number;
  exp?: number;
}
