import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEsbeuAssessmentDto } from './dto/create-esbeu-assessment.dto';
import { ESBEU_CONSENT_TEXT, ESBEU_CONSENT_VERSION, ESBEU_FORM_VERSION } from './esbeu-contract';

const summarySelect = {
  id: true, createdAt: true, estimatedOverall: true, observedOverall: true,
  observedExhaustion: true, observedDistancing: true, observedInefficacy: true,
  modelName: true, modelVersion: true, datasetVersion: true, contractVersion: true, formVersion: true,
} satisfies Prisma.EsbeuAssessmentSelect;

@Injectable()
export class EsbeuAssessmentsService {
  constructor(private readonly prisma: PrismaService, private readonly ai: AiService, private readonly config: ConfigService) {}

  private ensureEnabled() {
    if (this.config.get<string>('ESBEU_ASSESSMENTS_ENABLED') === 'false') {
      throw new ServiceUnavailableException('Novas avaliações ESB-eu estão temporariamente desativadas.');
    }
  }

  async form() {
    this.ensureEnabled();
    return { ...await this.ai.formSchema(), consent: { version: ESBEU_CONSENT_VERSION, text: ESBEU_CONSENT_TEXT } };
  }

  async create(userId: string, payload: CreateEsbeuAssessmentDto) {
    this.ensureEnabled();
    if (payload.consent !== true || payload.adult !== true || payload.enrolled !== true || payload.consentVersion !== ESBEU_CONSENT_VERSION) {
      throw new BadRequestException('Confirme consentimento e elegibilidade na versão atual do formulário.');
    }
    // Send no account identifier, consent or research CSV to the independent AI.
    const [prediction, observed] = await Promise.all([
      this.ai.predict({ context: payload.context }),
      payload.items === undefined ? Promise.resolve(null) : this.ai.score(payload.items),
    ]);
    try {
      return await this.prisma.esbeuAssessment.create({
        data: {
          userId, context: payload.context as Prisma.InputJsonObject,
          ...(payload.items === undefined ? {} : { observedItems: payload.items as Prisma.InputJsonObject }),
          estimatedOverall: prediction.esbeu_overall, observedOverall: observed?.overall ?? null,
          observedExhaustion: observed?.emotional_physical_exhaustion ?? null,
          observedDistancing: observed?.distancing ?? null, observedInefficacy: observed?.training_inefficacy ?? null,
          modelName: prediction.model_name, modelVersion: prediction.model_version,
          datasetVersion: prediction.dataset_version, contractVersion: prediction.contract_version,
          formVersion: ESBEU_FORM_VERSION, consentVersion: ESBEU_CONSENT_VERSION, consentAcceptedAt: new Date(),
          adultConfirmed: true, enrolledConfirmed: true,
        }, select: summarySelect,
      });
    } catch {
      // Prisma exceptions may contain query arguments; never propagate or log them.
      throw new ServiceUnavailableException('Não foi possível armazenar a avaliação. Nenhum resultado foi confirmado.');
    }
  }

  async list(userId: string, cursor?: string) {
    if (cursor) await this.detail(userId, cursor);
    try {
      const rows = await this.prisma.esbeuAssessment.findMany({
        where: { userId }, select: summarySelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 26,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const items = rows.slice(0, 25);
      return { items, nextCursor: rows.length > 25 ? items[items.length - 1].id : null };
    } catch {
      throw new ServiceUnavailableException('Não foi possível consultar o histórico ESB-eu.');
    }
  }

  async detail(userId: string, id: string) {
    let record;
    try {
      record = await this.prisma.esbeuAssessment.findFirst({ where: { id, userId },
        select: { ...summarySelect, context: true, observedItems: true, consentVersion: true, consentAcceptedAt: true } });
    } catch {
      throw new ServiceUnavailableException('Não foi possível consultar a avaliação ESB-eu.');
    }
    if (!record) throw new NotFoundException('Avaliação não encontrada.');
    return record;
  }

  async remove(userId: string, id: string) {
    let deleted;
    try {
      deleted = await this.prisma.esbeuAssessment.deleteMany({ where: { id, userId } });
    } catch {
      throw new ServiceUnavailableException('Não foi possível excluir a avaliação ESB-eu.');
    }
    if (!deleted.count) throw new NotFoundException('Avaliação não encontrada.');
  }
}
