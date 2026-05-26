import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByAssessmentId(userId: string, assessmentId: string) {
    const result = await this.prisma.predictionResult.findFirst({
      where: {
        assessmentId,
        assessment: {
          userId,
        },
      },
    });

    if (!result) {
      throw new NotFoundException('Prediction result not found.');
    }

    return {
      ...result,
      disclaimer:
        'This result is a preventive computational estimate and is not a clinical diagnosis.',
    };
  }
}
