import { Prisma } from '@prisma/client';

export const safeUserSelect = {
  id: true, name: true, email: true, role: true, emailAlerts: true,
  dailyReminder: true, course: true, semester: true, avatarUrl: true,
  createdAt: true, updatedAt: true,
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof safeUserSelect }>;
