import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Pick<Prisma.UserCreateInput, 'name' | 'email' | 'passwordHash'>) {
    return this.prisma.user.create({ data });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findSafeById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return this.toSafeUser(user);
  }

  async deleteOwnAccount(id: string) {
    await this.prisma.user.delete({ where: { id } });

    return {
      message: 'Account and related data deleted successfully.',
    };
  }

  toSafeUser(user: User) {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
