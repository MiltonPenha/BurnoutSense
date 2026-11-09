import { ConfigService } from '@nestjs/config';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { ESBEU_CONSENT_VERSION } from '../esbeu-assessments/esbeu-contract';
import { ContextEvolutionService } from './context-evolution.service';

describe('Experimental predictions are real and independently traceable', () => {
  const baseline = { sleep_hours: 8, sleep_quality: 4, assessment_pressure: 0, study_rest_difficulty: 0, personal_support: 4 };
  const anchor = { id: 'anchor', context: baseline, source: 'context', createdAt: new Date('2026-11-01T10:00:00Z'), consentAcceptedAt: new Date('2026-10-30T10:00:00Z'), consentVersion: ESBEU_CONSENT_VERSION, adultConfirmed: true, enrolledConfirmed: true };
  let rows: { id: string; date: Date; updatedAt: Date; sleepHours: number; observations: object }[];
  let table: { findFirst: jest.Mock; create: jest.Mock };
  let daily: { findMany: jest.Mock };
  let ai: { predict: jest.Mock };
  let service: ContextEvolutionService;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-04T15:00:00Z'));
    rows = [{ id: 'daily', date: new Date('2026-11-04T00:00:00Z'), updatedAt: new Date('2026-11-04T12:00:00Z'), sleepHours: 5,
      observations: { sleep_quality: 1, assessment_pressure: 4, study_rest_difficulty: 3, personal_support: 0 } }];
    table = { findFirst: jest.fn().mockResolvedValue(anchor), create: jest.fn().mockResolvedValue({ id: 'derived', estimatedOverall: 2.5 }) };
    daily = { findMany: jest.fn().mockImplementation(() => Promise.resolve(rows)) };
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
});
