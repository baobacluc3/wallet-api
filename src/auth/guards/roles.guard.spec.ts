import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../users/enums/role.enum';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const context = (user?: { role: Role }) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  it('allows routes with no role metadata', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;

    expect(new RolesGuard(reflector).canActivate(context())).toBe(true);
  });

  it('allows a user whose role is required by the route', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;

    expect(
      new RolesGuard(reflector).canActivate(context({ role: Role.ADMIN })),
    ).toBe(true);
  });

  it('denies a user whose role is not required by the route', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;

    expect(
      new RolesGuard(reflector).canActivate(context({ role: Role.USER })),
    ).toBe(false);
  });

  it('rejects a role-protected route without an authenticated user', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;

    expect(() => new RolesGuard(reflector).canActivate(context())).toThrow(
      ForbiddenException,
    );
  });
});
