import { UserRole } from '@prisma/client';
import { SafeUser } from '../../users/safe-user';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  profile?: SafeUser;
}
