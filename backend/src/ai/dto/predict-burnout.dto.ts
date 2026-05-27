import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PredictBurnoutDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsNumber()
  @Min(0)
  @Max(24)
  @Type(() => Number)
  studyHours!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  @Type(() => Number)
  sleepHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  @Type(() => Number)
  workHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  @Type(() => Number)
  pendingTasks?: number;

  @IsOptional()
  @IsBoolean()
  hasImportantExamOrDelivery?: boolean;

  @IsOptional()
  @IsBoolean()
  importantDelivery?: boolean;

  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  sleepQuality!: number;

  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  stressLevel!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  tirednessLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  anxietyLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  depressionScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  academicPerformance?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  examPressure?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  @Type(() => Number)
  screenTime?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  socialSupport?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  financialStress?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  physicalActivity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  motivationLevel?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  @Type(() => Number)
  internetUsage?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  familyExpectation?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  dropoutRisk?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  mood?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  dailyDescription?: string;
}
