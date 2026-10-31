import { Equals, IsBoolean, IsNotEmptyObject, IsObject, IsString, ValidateIf } from 'class-validator';
import { ESBEU_CONSENT_VERSION } from '../esbeu-contract';

export class CreateEsbeuAssessmentDto {
  @IsObject()
  @IsNotEmptyObject()
  context!: Record<string, unknown>;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @IsNotEmptyObject()
  items?: Record<string, unknown>;

  @IsBoolean()
  @Equals(true)
  consent!: boolean;

  @IsBoolean()
  @Equals(true)
  adult!: boolean;

  @IsBoolean()
  @Equals(true)
  enrolled!: boolean;

  @IsString()
  @Equals(ESBEU_CONSENT_VERSION)
  consentVersion!: string;
}
