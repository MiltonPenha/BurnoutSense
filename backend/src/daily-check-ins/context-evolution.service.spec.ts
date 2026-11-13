import { ConfigService } from '@nestjs/config';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { ESBEU_CONSENT_VERSION } from '../esbeu-assessments/esbeu-contract';
import { ContextEvolutionService } from './context-evolution.service';

describe('Experimental predictions are real and independently traceable', () => {
  const baseline = { sleep_hours: 8, sleep_quality: 4, assessment_pressure: 0, study_rest_difficulty: 0, personal_support: 4 };
  const anchor = { id: 'anchor', context: baseline, source: 'context', createdAt: new Date('2026-11-01T10:00:00Z'), consentAcceptedAt: new Date('2026-10-30T10:00:00Z'), consentVersion: ESBEU_CONSENT_VERSION, adultConfirmed: true, enrolledConfirmed: true };
  let rows: { id: string; date: Date; createdAt: Date; updatedAt: Date; indexProcessedRevision?: Date; sleepHours: number; observations: object }[];
  let table: { findFirst: jest.Mock; create: jest.Mock };
  let daily: { findMany: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
  let ai: { predict: jest.Mock };
  let service: ContextEvolutionService;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-04T15:00:00Z'));
    rows = [{ id: 'daily', date: new Date('2026-11-04T00:00:00Z'), createdAt: new Date('2026-11-04T11:00:00Z'), updatedAt: new Date('2026-11-04T12:00:00Z'), sleepHours: 5,
      observations: { sleep_quality: 1, assessment_pressure: 4, study_rest_difficulty: 3, personal_support: 0 } }];
    table = { findFirst: jest.fn().mockResolvedValue(anchor), create: jest.fn().mockResolvedValue({ id: 'derived', estimatedOverall: 2.5 }) };
    daily = { findMany: jest.fn().mockImplementation(() => Promise.resolve(rows)),
      findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id ? rows.find(row => row.id === where.id)
        : [...rows].sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    const tx = { esbeuAssessment: table, dailyCheckIn: daily, $queryRaw: jest.fn() };
    const prisma = { ...tx, $transaction: jest.fn().mockImplementation(async (operation: (arg: unknown) => Promise<unknown>) => operation(tx)) };
    ai = { predict: jest.fn().mockResolvedValue({ esbeu_overall: 2.5, model_name: 'random_forest', model_version: 'sha256:example', dataset_version: 'test', contract_version: 'esbeu-context-regression/1' }) };
    service = new ContextEvolutionService(prisma as unknown as PrismaService, ai as unknown as AiService,
      { get: (key: string) => key === 'DAILY_REMINDER_TIMEZONE' ? 'America/Sao_Paulo' : 'true' } as unknown as ConfigService);
  });
  afterEach(() => jest.useRealTimers());
  it('recalculates the complete context and stores original consent plus transformation provenance', async () => {
    const result = await service.recalculate('owner'); expect(result.status).toBe('updated');
    expect(ai.predict).toHaveBeenCalledWith({ context: { sleep_hours: 5, sleep_quality: 1, assessment_pressure: 4, study_rest_difficulty: 3, personal_support: 0 } });
    expect(table.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'owner', source: 'daily_experimental', consentAcceptedAt: anchor.consentAcceptedAt,
      evolution: expect.objectContaining({ anchorAssessmentId: 'anchor', experimental: true, recordedDays: 1, windowStart: '2026-10-08', windowEnd: '2026-11-04' }) }) });
    expect(daily.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'owner', updatedAt: { gte: anchor.createdAt } }) }));
  });
  it('does not invent a score when AI fails', async () => {
    ai.predict.mockRejectedValue(new Error('private-upstream-marker'));
    expect((await service.recalculate('owner')).status).toBe('unavailable'); expect(table.create).not.toHaveBeenCalled();
    expect(daily.updateMany).not.toHaveBeenCalled();
  });
  it('links a derived index to its triggering day with separate registration and revision timestamps', async () => {
    const trigger = { ...rows[0], createdAt: new Date('2026-11-04T11:00:00Z') };
    daily.findFirst.mockResolvedValue(trigger);
    expect((await service.recalculate('owner', trigger.id)).status).toBe('updated');
    expect(table.create).toHaveBeenCalledWith({ data: expect.objectContaining({ triggerCheckInId: trigger.id,
      evolution: expect.objectContaining({ trigger: { id: trigger.id, date: '2026-11-04', createdAt: '2026-11-04T11:00:00.000Z', updatedAt: '2026-11-04T12:00:00.000Z' } }) }) });
  });
  it('does not associate another owner or a deleted triggering day', async () => {
    daily.findFirst.mockResolvedValue(null);
    expect((await service.recalculate('owner', 'foreign')).status).toBe('superseded');
    expect(ai.predict).not.toHaveBeenCalled();
  });
  it('keeps earlier daily evidence after a guided review and returns to the confirmed baseline when it expires', async () => {
    const revised = { ...baseline, academic_support: 4 };
    const guided = { ...anchor, id: 'guided', source: 'guided_review', createdAt: new Date('2026-11-04T14:00:00Z'),
      dailyEvidenceSince: anchor.createdAt, dailyBaseline: revised, context: { ...revised, sleep_hours: 5, ...rows[0].observations } };
    table.findFirst.mockResolvedValue(guided);
    expect((await service.status('owner')).recordedDays).toBe(1);
    expect(daily.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ updatedAt: { gte: anchor.createdAt } }) }));
    rows = [];
    expect((await service.recalculate('owner')).status).toBe('updated');
    expect(ai.predict).toHaveBeenCalledWith({ context: revised });
  });
  it('does not create duplicate predictions if model inputs did not change', async () => {
    rows = []; expect((await service.recalculate('owner')).status).toBe('unchanged');
    expect(ai.predict).not.toHaveBeenCalled(); expect(table.create).not.toHaveBeenCalled();
  });
  it('rejects superseded evidence rather than publishing a stale index', async () => {
    ai.predict.mockImplementation(() => { rows = []; return Promise.resolve({ esbeu_overall: 2.5 }); });
    expect((await service.recalculate('owner')).status).toBe('superseded'); expect(table.create).not.toHaveBeenCalled();
  });
  it('does not publish when the latest result changes while inference is running', async () => {
    ai.predict.mockImplementation(() => {
      table.findFirst.mockResolvedValueOnce(anchor).mockResolvedValueOnce({ ...anchor, id: 'changed-latest' });
      return Promise.resolve({ esbeu_overall: 2.5 });
    });
    expect((await service.recalculate('owner')).status).toBe('superseded');
    expect(table.create).not.toHaveBeenCalled();
  });

  it('keeps the current index when an older reference day is saved or edited', async () => {
    const older = { ...rows[0], id: 'older', date: new Date('2026-11-03T00:00:00Z'), updatedAt: new Date('2026-11-04T14:00:00Z') };
    rows.push(older);
    expect((await service.recalculate('owner', older.id)).status).toBe('historical');
    expect(ai.predict).not.toHaveBeenCalled();
    expect(table.create).not.toHaveBeenCalled();
    expect(daily.updateMany).not.toHaveBeenCalled();
  });

  it('allows a retroactive day to calculate when it is the newest reference day', async () => {
    rows[0].date = new Date('2026-11-03T00:00:00Z');
    const trigger = { ...rows[0], createdAt: rows[0].updatedAt };
    daily.findFirst.mockResolvedValue(trigger);
    expect((await service.recalculate('owner', trigger.id)).status).toBe('updated');
    expect(ai.predict).toHaveBeenCalledTimes(1);
  });

  it('acknowledges unchanged newest-day inputs without modifying their registration or revision', async () => {
    rows[0] = { ...rows[0], sleepHours: 8, observations: { sleep_quality: 4, assessment_pressure: 0, study_rest_difficulty: 0, personal_support: 4 } };
    expect((await service.recalculate('owner', rows[0].id)).status).toBe('unchanged');
    expect(daily.updateMany).toHaveBeenCalledWith({ where: { userId: 'owner', id: rows[0].id, updatedAt: rows[0].updatedAt },
      data: { indexProcessedRevision: rows[0].updatedAt, updatedAt: rows[0].updatedAt } });
    expect(ai.predict).not.toHaveBeenCalled();
  });

  it('does not report a pending calculation or let retry bypass a historical-only save', async () => {
    const latest = { ...anchor, id: 'current', createdAt: new Date('2026-11-04T13:00:00Z') };
    table.findFirst.mockImplementation(({ where }) => Promise.resolve(where.source ? anchor : latest));
    rows[0].indexProcessedRevision = rows[0].updatedAt;
    expect((await service.status('owner')).pending).toBe(false);
    expect((await service.recalculate('owner')).status).toBe('unchanged');
    expect(ai.predict).not.toHaveBeenCalled();
  });

  it('marks newest-day AI failures as pending and retries them', async () => {
    ai.predict.mockRejectedValueOnce(new Error('offline'));
    expect((await service.recalculate('owner', rows[0].id)).status).toBe('unavailable');
    expect((await service.status('owner')).pending).toBe(true);
    expect((await service.recalculate('owner')).status).toBe('updated');
  });

  it('preserves migrated accounts without a processed revision when the latest result is newer', async () => {
    const latest = { ...anchor, id: 'existing-current', createdAt: new Date('2026-11-04T13:00:00Z') };
    table.findFirst.mockImplementation(({ where }) => Promise.resolve(where.source ? anchor : latest));
    expect(rows[0].indexProcessedRevision).toBeUndefined();
    expect((await service.status('owner')).pending).toBe(false);
    expect((await service.recalculate('owner')).status).toBe('unchanged');
    expect(ai.predict).not.toHaveBeenCalled();
  });

  it('does not turn a historical-only save into a pending update after midnight', async () => {
    const latest = { ...anchor, id: 'yesterday-current', createdAt: new Date('2026-11-03T13:00:00Z') };
    table.findFirst.mockImplementation(({ where }) => Promise.resolve(where.source ? anchor : latest));
    rows[0] = { ...rows[0], date: new Date('2026-11-03T00:00:00Z'), updatedAt: new Date('2026-11-03T12:00:00Z'), indexProcessedRevision: new Date('2026-11-03T12:00:00Z') };
    rows.push({ ...rows[0], id: 'older', date: new Date('2026-11-02T00:00:00Z'), updatedAt: new Date('2026-11-04T12:00:00Z') });
    expect((await service.recalculate('owner', 'older')).status).toBe('historical');
    expect((await service.status('owner')).pending).toBe(false);
    expect((await service.recalculate('owner')).status).toBe('unchanged');
    expect(ai.predict).not.toHaveBeenCalled();
  });

  it('recalculates the same 28-day averages on a new latest-day save, including older evidence', async () => {
    const latest = { ...anchor, id: 'current', createdAt: new Date('2026-11-04T13:00:00Z') };
    table.findFirst.mockImplementation(({ where }) => Promise.resolve(where.source ? anchor : latest));
    rows[0].updatedAt = new Date('2026-11-04T14:00:00Z');
    rows.push({ ...rows[0], id: 'older', date: new Date('2026-11-03T00:00:00Z'), sleepHours: 7 });
    expect((await service.recalculate('owner', rows[0].id)).status).toBe('updated');
    expect(ai.predict).toHaveBeenCalledWith({ context: expect.objectContaining({ sleep_hours: 6 }) });
  });

  it('does not publish or acknowledge a revision changed during inference', async () => {
    daily.updateMany.mockResolvedValue({ count: 0 });
    expect((await service.recalculate('owner', rows[0].id)).status).toBe('superseded');
    expect(table.create).not.toHaveBeenCalled();
  });
});
