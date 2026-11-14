import { Body, Controller, Delete, Get, Patch, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { SessionSecurityService } from '../auth/session-security.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UpdateCurrentUserDto } from './dto/update-current-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService, private readonly security: SessionSecurityService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findSafeById(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() updateCurrentUserDto: UpdateCurrentUserDto,
  ) {
    return this.usersService.updateOwnProfile(user.id, updateCurrentUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  async deleteMe(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) response: Response) {
    const result = await this.usersService.deleteOwnAccount(user.id);
    this.security.clear(response); return result;
  }
}
