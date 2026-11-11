import { IsBoolean, IsOptional } from 'class-validator';

export class TestNotificationDto {
  @IsOptional()
  @IsBoolean()
  dailyReminder?: boolean;
}
