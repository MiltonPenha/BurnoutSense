import { IsNotEmptyObject, IsObject } from 'class-validator';

/** Values are validated against the canonical schema by the independent AI service. */
export class PredictEsbeuDto {
  @IsObject()
  @IsNotEmptyObject()
  context!: Record<string, unknown>;
}
