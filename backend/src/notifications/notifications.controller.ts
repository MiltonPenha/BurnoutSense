import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { TestNotificationDto } from './dto/test-notification.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('test')
  testNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Body() testNotificationDto: TestNotificationDto,
  ) {
    return this.notificationsService.sendTestNotification(user, testNotificationDto);
  }
}
