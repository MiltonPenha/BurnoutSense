import { Equals, IsBoolean, IsIn, IsNotEmptyObject, IsObject, IsUUID } from 'class-validator';
import { reviewTopicIds, ReviewTopicId } from '../review-topics';

export class GuidedContextReviewDto {
  @IsUUID()
  sourceAssessmentId!: string;

  @IsBoolean()
  @Equals(true)
  confirmed!: boolean;

  @IsIn(reviewTopicIds)
  topic!: ReviewTopicId;

  @IsObject()
  @IsNotEmptyObject()
  changes!: Record<string, unknown>;
}
