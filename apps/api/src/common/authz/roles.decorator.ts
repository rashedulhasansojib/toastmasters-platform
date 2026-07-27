import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Requires the principal to hold at least one of the named roles. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
