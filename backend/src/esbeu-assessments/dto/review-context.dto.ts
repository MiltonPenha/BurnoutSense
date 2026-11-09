import { Equals, IsBoolean, IsNotEmptyObject, IsObject, IsUUID, ValidateIf } from 'class-validator';

export class ReviewContextDto {
  @IsUUID()
  sourceAssessmentId!: string;

  @IsBoolean()
  @Equals(true)
  confirmed!: boolean;

  @IsObject()
  @IsNotEmptyObject()
  context!: Record<string, unknown>;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @IsNotEmptyObject()
  items?: Record<string, unknown>;
}
