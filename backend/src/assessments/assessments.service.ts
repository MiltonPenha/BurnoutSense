import { Injectable, NotFoundException } from '@nestjs/common';
import { BurnoutFeatureMapper } from '../ai/burnout-feature.mapper';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async create(userId: string, createAssessmentDto: CreateAssessmentDto) {
    const prediction = await this.aiService.predict(createAssessmentDto);
    const assessmentIndicators = BurnoutFeatureMapper.toStoredAssessment(createAssessmentDto);

    const assessment = await this.prisma.assessment.create({
      data: {
        userId,
        ...assessmentIndicators,
        result: {
          create: {
            riskLevel: prediction.riskLevel,
            confidence: prediction.confidence,
            mainFactors: prediction.mainFactors,
            modelVersion: prediction.modelVersion,
          },
        },
      },
      include: { result: true },
    });

    return {
      ...assessment,
      disclaimer: prediction.disclaimer,
    };
  }

  findAllByUser(userId: string) {
    return this.prisma.assessment.findMany({
      where: { userId },
      include: { result: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneByUser(userId: string, id: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, userId },
      include: { result: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found.');
    }

    return assessment;
  }
}
