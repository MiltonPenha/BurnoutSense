import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export const DAILY_MOODS = ['Feliz', 'Calmo', 'Ansioso', 'Triste', 'Irritado', 'Cansado', 'Desmotivado'];

export class DailyObservationsDto {
  @IsInt() @Min(0) @Max(4)
  sleep_quality!: number;

  @IsInt() @Min(0) @Max(4)
  assessment_pressure!: number;

  @IsInt() @Min(0) @Max(4)
  study_rest_difficulty!: number;

  @IsInt() @Min(0) @Max(4)
  personal_support!: number;
}

export class DailyDateDto {
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

export class SaveDailyCheckInDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsIn(DAILY_MOODS)
  mood!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(24)
  sleepHours!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  energy?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  academicDemand?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DailyObservationsDto)
  observations?: DailyObservationsDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
