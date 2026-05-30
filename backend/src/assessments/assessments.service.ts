import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BurnoutFeatureMapper } from '../ai/burnout-feature.mapper';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, createAssessmentDto: CreateAssessmentDto) {
    const assessmentIndicators = BurnoutFeatureMapper.toStoredAssessment(createAssessmentDto);
    validateStoredAssessmentIndicators(assessmentIndicators);
    const prediction = await this.aiService.predict(createAssessmentDto);

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

    await this.notificationsService.sendHighRiskAlert(userId, assessmentIndicators, prediction.mainFactors, prediction.riskLevel);

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

  async updateByUser(userId: string, id: string, updateAssessmentDto: CreateAssessmentDto) {
    const existingAssessment = await this.prisma.assessment.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!existingAssessment) {
      throw new NotFoundException('Assessment not found.');
    }

    const assessmentIndicators = BurnoutFeatureMapper.toStoredAssessment(updateAssessmentDto);
    validateStoredAssessmentIndicators(assessmentIndicators);
    const prediction = await this.aiService.predict(updateAssessmentDto);

    const assessment = await this.prisma.assessment.update({
      where: { id },
      data: {
        ...assessmentIndicators,
        result: {
          upsert: {
            create: {
              riskLevel: prediction.riskLevel,
              confidence: prediction.confidence,
              mainFactors: prediction.mainFactors,
              modelVersion: prediction.modelVersion,
            },
            update: {
              riskLevel: prediction.riskLevel,
              confidence: prediction.confidence,
              mainFactors: prediction.mainFactors,
              modelVersion: prediction.modelVersion,
            },
          },
        },
      },
      include: { result: true },
    });

    await this.notificationsService.sendHighRiskAlert(userId, assessmentIndicators, prediction.mainFactors, prediction.riskLevel);

    return {
      ...assessment,
      disclaimer: prediction.disclaimer,
    };
  }

  async deleteByUser(userId: string, id: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found.');
    }

    await this.prisma.assessment.delete({ where: { id } });
  }
}

function validateStoredAssessmentIndicators(assessmentIndicators: { sleepHours: number; studyHours: number; workHours: number }) {
  const dailyAllocatedHours = assessmentIndicators.sleepHours + assessmentIndicators.studyHours + assessmentIndicators.workHours;

  if (dailyAllocatedHours > 24) {
    throw new BadRequestException(
      'Sleep, study and work hours cannot exceed 24 hours. Screen time is stored separately because it can overlap with study or work.',
    );
  }
}
