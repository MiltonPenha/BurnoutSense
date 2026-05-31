import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RiskLevel } from '@prisma/client';
import { BurnoutFeatureMapper, StoredAssessmentIndicators } from '../ai/burnout-feature.mapper';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

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
            riskScore: prediction.riskScore,
            mainFactors: prediction.mainFactors,
            modelVersion: prediction.modelVersion,
          },
        },
      },
      include: { result: true },
    });

    this.queueHighRiskAlert(userId, assessmentIndicators, prediction.mainFactors, prediction.riskLevel);

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
              riskScore: prediction.riskScore,
              mainFactors: prediction.mainFactors,
              modelVersion: prediction.modelVersion,
            },
            update: {
              riskLevel: prediction.riskLevel,
              confidence: prediction.confidence,
              riskScore: prediction.riskScore,
              mainFactors: prediction.mainFactors,
              modelVersion: prediction.modelVersion,
            },
          },
        },
      },
      include: { result: true },
    });

    this.queueHighRiskAlert(userId, assessmentIndicators, prediction.mainFactors, prediction.riskLevel);

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

  private queueHighRiskAlert(
    userId: string,
    assessmentIndicators: StoredAssessmentIndicators,
    mainFactors: string[],
    riskLevel: RiskLevel,
  ) {
    void this.notificationsService
      .sendHighRiskAlert(userId, assessmentIndicators, mainFactors, riskLevel)
      .catch((error) => {
        this.logger.warn(
          `High-risk notification failed after assessment save: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      });
  }
}

function validateStoredAssessmentIndicators(assessmentIndicators: { date: Date; sleepHours: number; studyHours: number; screenTime: number }) {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (assessmentIndicators.date >= tomorrow) {
    throw new BadRequestException('A data do registro não pode ser futura.');
  }

  if (assessmentIndicators.sleepHours <= 0) {
    throw new BadRequestException('Informe uma quantidade de sono maior que zero.');
  }

  const dailyTrackedHours = assessmentIndicators.sleepHours + assessmentIndicators.studyHours + assessmentIndicators.screenTime;

  if (dailyTrackedHours > 24) {
    throw new BadRequestException(
      'Sono, estudo e tempo de tela não podem ultrapassar 24 horas no mesmo dia.',
    );
  }
}
