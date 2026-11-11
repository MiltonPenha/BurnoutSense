import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEsbeuAssessmentDto } from './dto/create-esbeu-assessment.dto';
import { ReviewContextDto } from './dto/review-context.dto';
import { GuidedContextReviewDto } from './dto/guided-context-review.dto';
import { reviewTopicIds, reviewTopics, suggestReviewTopic } from './review-topics';
import { ESBEU_CONSENT_TEXT, ESBEU_CONSENT_VERSION, ESBEU_FORM_VERSION } from './esbeu-contract';

const summarySelect = {
  triggerCheckIn: { select: { id: true, date: true, createdAt: true, updatedAt: true } },
  source: true, evolution: true,
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

  async current(userId: string) {
    try {
    const assessment = await this.prisma.esbeuAssessment.findFirst({
      where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { ...summarySelect, context: true, consentVersion: true, consentAcceptedAt: true, adultConfirmed: true, enrolledConfirmed: true },
    });
    return { assessment, canReuseConsent: Boolean(assessment?.adultConfirmed && assessment.enrolledConfirmed && assessment.consentVersion === ESBEU_CONSENT_VERSION) };
    } catch {
      throw new ServiceUnavailableException('Não foi possível consultar sua rotina atual.');
    }
  }

  async review(userId: string, payload: ReviewContextDto) {
    this.ensureEnabled();
    const { assessment, canReuseConsent } = await this.current(userId);
    if (!assessment || assessment.id !== payload.sourceAssessmentId) throw new ConflictException('Sua rotina foi atualizada. Recarregue antes de revisar.');
    if (!canReuseConsent || payload.confirmed !== true) throw new BadRequestException('Confirme suas respostas e a autorização de uso atual.');
    return this.create(userId, { context: payload.context, ...(payload.items === undefined ? {} : { items: payload.items }),
      consent: true, adult: true, enrolled: true, consentVersion: ESBEU_CONSENT_VERSION }, assessment.consentAcceptedAt);
  }

  async reviewTopics(userId: string) {
    const { assessment, canReuseConsent } = await this.current(userId);
    const topics = reviewTopicIds.map((id) => {
      const { title, description, fields } = reviewTopics[id];
      return { id, title, description, fieldIds: Object.keys(fields) };
    });
    if (!assessment || !canReuseConsent) return { topics, suggested: null };
    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    const full = await this.prisma.esbeuAssessment.findFirst({
      where: { userId, source: 'context' }, orderBy, select: { createdAt: true },
    });
    if (!full) return { topics, suggested: null };
    const dates = await Promise.all(reviewTopicIds.map(async (id) => {
      const latest = await this.prisma.esbeuAssessment.findFirst({
        where: { userId, source: 'guided_review', createdAt: { gte: full.createdAt }, evolution: { path: ['topic'], equals: id } },
        orderBy, select: { createdAt: true },
      });
      return [id, latest?.createdAt] as const;
    }));
    const confirmed = Object.fromEntries(dates.filter(([, date]) => date !== undefined));
    const employment = (assessment.context as Prisma.JsonObject).employment;
    return { topics, suggested: suggestReviewTopic(full.createdAt, confirmed, employment, new Date()) };
  }

  async guidedReview(userId: string, payload: GuidedContextReviewDto) {
    this.ensureEnabled();
    const topic = reviewTopicIds.includes(payload.topic) ? reviewTopics[payload.topic] : null;
    const fieldLabels: Readonly<Record<string, string>> = topic?.fields ?? {};
    const entries = Object.entries(payload.changes);
    if (!entries.length || entries.length > 4 || entries.some(([key, value]) =>
      !Object.prototype.hasOwnProperty.call(fieldLabels, key) || !(typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && value.length <= 100))) {
      throw new BadRequestException('Selecione até quatro respostas válidas para revisar.');
    }
    const conflict = () => new ConflictException('Sua rotina foi atualizada. Recarregue antes de revisar.');
    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
        const latest = await tx.esbeuAssessment.findFirst({ where: { userId }, orderBy });
        if (!latest || latest.id !== payload.sourceAssessmentId) throw conflict();
        if (!latest.adultConfirmed || !latest.enrolledConfirmed || latest.consentVersion !== ESBEU_CONSENT_VERSION || !payload.confirmed) {
          throw new BadRequestException('Confirme suas respostas e a autorização de uso atual.');
        }
        const anchor = await tx.esbeuAssessment.findFirst({ where: { userId, source: { in: ['context', 'guided_review'] } }, orderBy });
        if (!anchor) throw conflict();
        const previous = latest.context as Prisma.JsonObject;
        const changes = Object.fromEntries(entries.filter(([key, value]) => previous[key] !== value));
        if (!Object.keys(changes).length) throw new BadRequestException('Nenhuma resposta foi alterada.');
        const context = { ...previous, ...changes } as Prisma.InputJsonObject;
        const prediction = await this.ai.predict({ context });
        const fresh = await tx.esbeuAssessment.findFirst({ where: { userId }, orderBy, select: { id: true } });
        if (fresh?.id !== latest.id) throw conflict();
        // Keep experimental daily values out of the baseline used when evidence expires.
        const dailyBaseline = { ...(anchor.dailyBaseline ?? anchor.context) as Prisma.JsonObject, ...changes } as Prisma.InputJsonObject;
        return tx.esbeuAssessment.create({ data: {
          userId, source: 'guided_review', context, dailyBaseline, dailyEvidenceSince: anchor.dailyEvidenceSince ?? anchor.createdAt,
          evolution: { kind: 'guided_review', topic: payload.topic, topicTitle: topic!.title,
            reviewedFields: Object.keys(changes).map((key) => fieldLabels[key]), previousEstimatedOverall: latest.estimatedOverall },
          estimatedOverall: prediction.esbeu_overall, modelName: prediction.model_name, modelVersion: prediction.model_version,
          datasetVersion: prediction.dataset_version, contractVersion: prediction.contract_version,
          formVersion: ESBEU_FORM_VERSION, consentVersion: latest.consentVersion, consentAcceptedAt: latest.consentAcceptedAt,
          adultConfirmed: true, enrolledConfirmed: true,
        }, select: summarySelect });
      }, { timeout: 60000, maxWait: 5000 });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Não foi possível salvar a revisão. Tente novamente.');
    }
  }

  async create(userId: string, payload: CreateEsbeuAssessmentDto, acceptedAt?: Date) {
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
          formVersion: ESBEU_FORM_VERSION, consentVersion: ESBEU_CONSENT_VERSION, consentAcceptedAt: acceptedAt ?? new Date(),
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

  async trend(userId: string) {
    try {
      return await this.prisma.esbeuAssessment.findMany({
        where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, createdAt: true, estimatedOverall: true, triggerCheckIn: summarySelect.triggerCheckIn },
      });
    } catch {
      throw new ServiceUnavailableException('Não foi possível carregar a evolução dos índices.');
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
