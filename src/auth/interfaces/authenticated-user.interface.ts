import { Role } from '../../users/enums/role.enum';

/** The safe identity attached to request.user after JWT validation. */
export interface AuthenticatedUser {
  id: number;
  email: string;
  role: Role;
  jti: string;
  /** Unix timestamp taken from the JWT after Passport has verified it. */
  expiresAt: number;
}
