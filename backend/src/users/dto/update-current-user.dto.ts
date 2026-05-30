import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCurrentUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  emailAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  dailyReminder?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  course?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  semester?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3_000_000)
  avatarUrl?: string;
}
