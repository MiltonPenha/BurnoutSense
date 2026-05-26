import { Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findSafeById(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  deleteMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.deleteOwnAccount(user.id);
  }
}
