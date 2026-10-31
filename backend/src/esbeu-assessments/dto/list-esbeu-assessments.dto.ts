import { IsOptional, IsUUID } from 'class-validator';

export class ListEsbeuAssessmentsDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
