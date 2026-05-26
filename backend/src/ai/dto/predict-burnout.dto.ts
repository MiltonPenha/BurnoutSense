import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class PredictBurnoutDto {
  @IsNumber()
  @Min(0)
  @Max(24)
  studyHours!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  sleepQuality!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  stressLevel!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  anxietyLevel!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  academicPerformance!: number;

  @IsNumber()
  @Min(0)
  @Max(24)
  screenTime!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  socialSupport!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  financialStress!: number;

  @IsInt()
  @Min(0)
  @Max(7)
  physicalActivity!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  motivationLevel!: number;
}
