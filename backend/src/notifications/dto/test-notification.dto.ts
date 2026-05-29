import { IsBoolean, IsOptional } from 'class-validator';

export class TestNotificationDto {
  @IsOptional()
  @IsBoolean()
  emailAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  dailyReminder?: boolean;
}
