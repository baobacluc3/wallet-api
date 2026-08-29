import { Role } from '../../users/enums/role.enum';
import { SetMetadata } from '@nestjs/common';


export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);