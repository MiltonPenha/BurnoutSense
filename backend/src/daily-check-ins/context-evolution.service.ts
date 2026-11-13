import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { ESBEU_CONSENT_VERSION, ESBEU_FORM_VERSION } from '../esbeu-assessments/esbeu-contract';
import { aggregateContext, contextKey, EVOLUTION_VERSION } from './context-aggregation';
import { calendarDay, utcDay } from './calendar-day';

@Injectable()
export class ContextEvolutionService {
  constructor(private readonly prisma: PrismaService, private readonly ai: AiService, private readonly config: ConfigService) {}

  enabled() {
    return this.config.get<string>('DAILY_CONTEXT_EVOLUTION_ENABLED') === 'true'
      && this.config.get<string>('ESBEU_ASSESSMENTS_ENABLED') !== 'false';
  }

  private async snapshot(db: Prisma.TransactionClient, userId: string) {
    const today = calendarDay(new Date(), this.config.get<string>('DAILY_REMINDER_TIMEZONE') ?? 'America/Sao_Paulo');
    const since = utcDay(today); since.setUTCDate(since.getUTCDate() - 27);
    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    const anchor = await db.esbeuAssessment.findFirst({ where: { userId, source: { in: ['context', 'guided_review'] } }, orderBy });
    const latest = await db.esbeuAssessment.findFirst({ where: { userId }, orderBy });
    if (!anchor || !latest) return null;
    const rows = await db.dailyCheckIn.findMany({ where: { userId, date: { gte: since, lte: utcDay(today) }, updatedAt: { gte: anchor.dailyEvidenceSince ?? anchor.createdAt } }, orderBy: { date: 'asc' }, take: 28 });
    const newest = await db.dailyCheckIn.findFirst({ where: { userId, date: { lte: utcDay(today) } }, orderBy: { date: 'desc' } });
    return { anchor, latest, newest, today, since, aggregate: aggregateContext(anchor.dailyBaseline ?? anchor.context, rows) };
  }

  private needsCalculation(snapshot: NonNullable<Awaited<ReturnType<ContextEvolutionService['snapshot']>>>) {
    if (contextKey(snapshot.aggregate.context) === contextKey(snapshot.latest.context)) return false;
    const { newest, latest, since } = snapshot;
    // Historical edits stay deferred across midnight, not just on the save date.
    // If all daily evidence expires, a refresh can return to the confirmed context.
    return !newest || newest.date < since
      || newest.updatedAt > (newest.indexProcessedRevision ?? latest.createdAt);
  }

  private async acknowledge(db: Prisma.TransactionClient, userId: string, newest: NonNullable<Awaited<ReturnType<ContextEvolutionService['snapshot']>>>['newest']) {
    if (!newest) return true;
    const result = await db.dailyCheckIn.updateMany({ where: { userId, id: newest.id, updatedAt: newest.updatedAt },
      data: { indexProcessedRevision: newest.updatedAt, updatedAt: newest.updatedAt } });
    return result.count === 1;
  }

  async status(userId: string) {
    if (!this.enabled()) return { enabled: false, pending: false, recordedDays: 0 };
    const snapshot = await this.snapshot(this.prisma, userId);
    return { enabled: true, experimental: true, version: EVOLUTION_VERSION,
      pending: snapshot ? this.needsCalculation(snapshot) : false,
      recordedDays: snapshot?.aggregate.recordedDays ?? 0 };
  }

  async recalculate(userId: string, triggerCheckInId?: string, reason = triggerCheckInId ? 'check_in_saved' : 'window_refresh') {
    if (!this.enabled()) return { status: 'disabled' as const };
    try {
      // Serialize derived predictions per owner, but daily persistence happens first and
      // remains committed if the model fails. Recheck evidence after the upstream call.
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
        const snapshot = await this.snapshot(tx, userId);
        if (!snapshot) return { status: 'needs_context' as const };
        const { anchor, latest, newest, aggregate, today, since } = snapshot;
        const trigger = triggerCheckInId ? await tx.dailyCheckIn.findFirst({ where: { userId, id: triggerCheckInId } }) : null;
        if (triggerCheckInId && !trigger) return { status: 'superseded' as const };
        if (trigger && (trigger.date < since || newest && trigger.date < newest.date)) return { status: 'historical' as const };
        if (!anchor.adultConfirmed || !anchor.enrolledConfirmed || anchor.consentVersion !== ESBEU_CONSENT_VERSION) return { status: 'needs_context' as const };
        if (!trigger && reason === 'window_refresh' && !this.needsCalculation(snapshot)) return { status: 'unchanged' as const, assessment: latest };
        if (contextKey(aggregate.context) === contextKey(latest.context)) {
          if (!await this.acknowledge(tx, userId, newest)) return { status: 'superseded' as const };
          return { status: 'unchanged' as const, assessment: latest };
        }
        const prediction = await this.ai.predict({ context: aggregate.context });
        const fresh = await this.snapshot(tx, userId);
        if (!fresh || fresh.anchor.id !== anchor.id || fresh.latest.id !== latest.id || fresh.today !== today || fresh.aggregate.fingerprint !== aggregate.fingerprint
          || fresh.newest?.id !== newest?.id || fresh.newest?.updatedAt.getTime() !== newest?.updatedAt.getTime()) return { status: 'superseded' as const };
        if (trigger && !await tx.dailyCheckIn.findFirst({ where: { userId, id: trigger.id, updatedAt: trigger.updatedAt } })) return { status: 'superseded' as const };
        if (!await this.acknowledge(tx, userId, newest)) return { status: 'superseded' as const };
        const { context, ...provenance } = aggregate;
        const assessment = await tx.esbeuAssessment.create({ data: {
          userId, context, source: 'daily_experimental', triggerCheckInId: trigger?.id ?? null,
          evolution: { ...provenance, reason, version: EVOLUTION_VERSION, experimental: true, anchorAssessmentId: anchor.id,
            ...(trigger ? { trigger: { id: trigger.id, date: trigger.date.toISOString().slice(0, 10),
              createdAt: trigger.createdAt.toISOString(), updatedAt: trigger.updatedAt.toISOString() } } : {}),
            windowStart: since.toISOString().slice(0, 10), windowEnd: today, observedDaysOnly: true } as Prisma.InputJsonObject,
          estimatedOverall: prediction.esbeu_overall, modelName: prediction.model_name, modelVersion: prediction.model_version,
          datasetVersion: prediction.dataset_version, contractVersion: prediction.contract_version,
          formVersion: ESBEU_FORM_VERSION, consentVersion: anchor.consentVersion, consentAcceptedAt: anchor.consentAcceptedAt,
          adultConfirmed: true, enrolledConfirmed: true,
        } });
        return { status: 'updated' as const, assessment };
      }, { timeout: 60000, maxWait: 5000 });
    } catch {
      // Do not leak inputs or claim that a saved check-in was lost on AI failure.
      return { status: 'unavailable' as const };
    }
  }
}
