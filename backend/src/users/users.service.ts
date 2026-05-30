import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCurrentUserDto } from './dto/update-current-user.dto';

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

  async updateOwnProfile(id: string, data: UpdateCurrentUserDto) {
    const updateData: Prisma.UserUpdateInput = {};

    if (data.name !== undefined) {
      updateData.name = data.name.trim();
    }

    if (data.emailAlerts !== undefined) {
      updateData.emailAlerts = data.emailAlerts;
    }

    if (data.dailyReminder !== undefined) {
      updateData.dailyReminder = data.dailyReminder;
    }

    if (data.course !== undefined) {
      updateData.course = data.course.trim() || null;
    }

    if (data.semester !== undefined) {
      updateData.semester = data.semester.trim() || null;
    }

    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl || null;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    return this.toSafeUser(user);
  }

  toSafeUser(user: User) {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
