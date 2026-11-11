import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { EsbeuAssessmentsService } from './esbeu-assessments.service';
import { ESBEU_CONSENT_VERSION } from './esbeu-contract';

describe('Private ESB-eu application assessments', () => {
  const prediction = { kind: 'estimated_score', esbeu_overall: 1.5, model_name: 'ridge', model_version: `sha256:${'a'.repeat(64)}`,
    dataset_version: 'artificial-test', contract_version: 'esbeu-context-regression/1' };
  const observed = { kind: 'observed_score', overall: 2, emotional_physical_exhaustion: 2, distancing: 2, training_inefficacy: 2 };
  const payload = () => ({ context: { fictional: 1 }, consent: true, adult: true, enrolled: true, consentVersion: ESBEU_CONSENT_VERSION });
  let repository: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; deleteMany: jest.Mock };
  let ai: { predict: jest.Mock; score: jest.Mock; formSchema: jest.Mock };
  let config: { get: jest.Mock };
  let service: EsbeuAssessmentsService;
  beforeEach(() => {
    repository = { create: jest.fn().mockResolvedValue({ id: 'synthetic-id', estimatedOverall: 1.5 }),
      findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), deleteMany: jest.fn() };
    ai = { predict: jest.fn().mockResolvedValue(prediction), score: jest.fn().mockResolvedValue(observed),
      formSchema: jest.fn().mockResolvedValue({ form_version: 'forms/1.0' }) };
    config = { get: jest.fn() };
    const db = { esbeuAssessment: repository, $queryRaw: jest.fn() };
    service = new EsbeuAssessmentsService({ ...db, $transaction: (operation: (tx: typeof db) => unknown) => operation(db) } as unknown as PrismaService,
      ai as unknown as AiService, config as unknown as ConfigService);
  });

  it('sends only context to AI and persists provenance with server-side consent time', async () => {
    await service.create('fictional-user', payload());
    expect(ai.predict).toHaveBeenCalledWith({ context: { fictional: 1 } });
    expect(ai.score).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      userId: 'fictional-user', modelVersion: prediction.model_version, observedOverall: null,
      consentVersion: ESBEU_CONSENT_VERSION, consentAcceptedAt: expect.any(Date), adultConfirmed: true,
    }) }));
  });

  it('scores optional items separately, without adding items or identity to predictor payload', async () => {
    const items = { esbeu_01: 2 };
    await service.create('fictional-user', { ...payload(), items });
    expect(ai.predict).toHaveBeenCalledWith({ context: { fictional: 1 } });
    expect(ai.score).toHaveBeenCalledWith(items);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      observedItems: items, observedOverall: 2, observedExhaustion: 2, observedDistancing: 2, observedInefficacy: 2,
    }) }));
  });

  it.each(['consent', 'adult', 'enrolled'])('rejects missing confirmation of %s before inference', async (key) => {
    await expect(service.create('fictional-user', { ...payload(), [key]: false })).rejects.toBeInstanceOf(BadRequestException);
    expect(ai.predict).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects an old consent version before inference', async () => {
    await expect(service.create('fictional-user', { ...payload(), consentVersion: 'outdated' })).rejects.toBeInstanceOf(BadRequestException);
    expect(ai.predict).not.toHaveBeenCalled();
  });

  it('does not persist when AI is unavailable', async () => {
    ai.predict.mockRejectedValue(new ServiceUnavailableException('unavailable'));
    await expect(service.create('fictional-user', payload())).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('does not persist when optional items are invalid', async () => {
    ai.score.mockRejectedValue(new BadRequestException('invalid items'));
    await expect(service.create('fictional-user', { ...payload(), items: {} })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('sanitizes database failures instead of exposing query arguments', async () => {
    repository.create.mockRejectedValue(new Error('artificial-private-marker'));
    await expect(service.create('fictional-user', payload())).rejects.not.toThrow('artificial-private-marker');
  });

  it('paginates summaries scoped to owner, without context or items', async () => {
    repository.findMany.mockResolvedValue(Array.from({ length: 26 }, (_, index) => ({ id: `synthetic-${index}` })));
    const page = await service.list('fictional-user');
    expect(page.items).toHaveLength(25);
    expect(page.nextCursor).toBe('synthetic-24');
    const query = repository.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ userId: 'fictional-user' });
    expect(query.select.context).toBeUndefined();
    expect(query.select.observedItems).toBeUndefined();
  });
  it('returns the complete chart series scoped to its owner without private answers', async () => {
    await service.trend('owner');
    expect(repository.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'owner' },
      select: { id: true, createdAt: true, estimatedOverall: true, triggerCheckIn: expect.any(Object) },
    }));
    expect(repository.findMany.mock.calls[0][0]).not.toHaveProperty('take');
  });

  it('does not allow another owner to use a detail or pagination cursor', async () => {
    repository.findFirst.mockResolvedValue(null);
    await expect(service.detail('other-user', 'synthetic-id')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.list('other-user', 'synthetic-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'synthetic-id', userId: 'other-user' } }));
    expect(repository.findMany).not.toHaveBeenCalled();
  });

  it('uses an atomic owner-scoped deletion', async () => {
    repository.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove('other-user', 'synthetic-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.deleteMany).toHaveBeenCalledWith({ where: { id: 'synthetic-id', userId: 'other-user' } });
    repository.deleteMany.mockResolvedValue({ count: 1 });
    await expect(service.remove('fictional-user', 'synthetic-id')).resolves.toBeUndefined();
  });

  it('disables new writes and form while keeping stored history readable for rollback', async () => {
    config.get.mockReturnValue('false');
    await expect(service.form()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.create('fictional-user', payload())).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.list('fictional-user')).resolves.toEqual({ items: [], nextCursor: null });
    expect(ai.predict).not.toHaveBeenCalled();
  });

  it('reuses verified consent from the latest owned context and preserves the original acceptance date', async () => {
    const date = new Date('2026-10-30T15:00:00Z');
    repository.findFirst.mockResolvedValue({ id: 'latest', adultConfirmed: true, enrolledConfirmed: true, consentVersion: ESBEU_CONSENT_VERSION, consentAcceptedAt: date });
    await service.review('owner', { sourceAssessmentId: 'latest', confirmed: true, context: { updated: 1 } });
    expect(repository.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner' } }));
    expect(ai.predict).toHaveBeenCalledWith({ context: { updated: 1 } });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ consentAcceptedAt: date, userId: 'owner' }) }));
  });
  it('rejects a stale or foreign context revision', async () => {
    repository.findFirst.mockResolvedValue({ id: 'latest' });
    await expect(service.review('owner', { sourceAssessmentId: 'other', confirmed: true, context: { updated: 1 } })).rejects.toBeInstanceOf(ConflictException);
    expect(ai.predict).not.toHaveBeenCalled();
  });
  it('requires renewed consent if the persisted consent version is outdated', async () => {
    repository.findFirst.mockResolvedValue({ id: 'latest', adultConfirmed: true, enrolledConfirmed: true, consentVersion: 'old' });
    await expect(service.review('owner', { sourceAssessmentId: 'latest', confirmed: true, context: { updated: 1 } })).rejects.toBeInstanceOf(BadRequestException);
    expect(ai.predict).not.toHaveBeenCalled();
  });

  it('changes only confirmed guided fields and retains original daily evidence without making inferred answers the baseline', async () => {
    const date = new Date('2026-10-30T15:00:00Z');
    const latest = { id: 'latest', estimatedOverall: 1.5, adultConfirmed: true, enrolledConfirmed: true, consentVersion: ESBEU_CONSENT_VERSION,
      consentAcceptedAt: date, context: { sleep_hours: 7, subject_overload: 3, academic_support: 1 } };
    repository.findFirst.mockResolvedValueOnce(latest).mockResolvedValueOnce({ createdAt: date,
      context: { sleep_hours: 4, subject_overload: 3, academic_support: 1 } }).mockResolvedValueOnce({ id: latest.id });
    await service.guidedReview('owner', { topic: 'demandas', sourceAssessmentId: latest.id, confirmed: true, changes: { subject_overload: 1 } });
    expect(ai.predict).toHaveBeenCalledWith({ context: { sleep_hours: 7, subject_overload: 1, academic_support: 1 } });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      source: 'guided_review', dailyEvidenceSince: date, dailyBaseline: { sleep_hours: 4, subject_overload: 1, academic_support: 1 },
      evolution: expect.objectContaining({ topic: 'demandas', reviewedFields: ['Sobrecarga de disciplinas'], previousEstimatedOverall: 1.5 }),
    }) }));
  });

  it('rejects fields outside the guided review and stale sources without calling AI', async () => {
    await expect(service.guidedReview('owner', { topic: 'demandas', sourceAssessmentId: 'latest', confirmed: true, changes: { sleep_hours: 8 } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.guidedReview('owner', { topic: 'demandas', sourceAssessmentId: 'latest', confirmed: true, changes: { academic_support: 4 } })).rejects.toBeInstanceOf(BadRequestException);
    repository.findFirst.mockResolvedValue({ id: 'newer' });
    await expect(service.guidedReview('owner', { topic: 'apoio', sourceAssessmentId: 'latest', confirmed: true, changes: { academic_support: 4 } })).rejects.toBeInstanceOf(ConflictException);
    expect(ai.predict).not.toHaveBeenCalled();
  });

  it('does not recalculate or persist when a confirmed topic has no changed answers', async () => {
    const latest = { id: 'latest', adultConfirmed: true, enrolledConfirmed: true, consentVersion: ESBEU_CONSENT_VERSION,
      context: { academic_support: 4 } };
    repository.findFirst.mockResolvedValue(latest);
    await expect(service.guidedReview('owner', { topic: 'apoio', sourceAssessmentId: latest.id, confirmed: true, changes: { academic_support: 4 } }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(ai.predict).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });
});
