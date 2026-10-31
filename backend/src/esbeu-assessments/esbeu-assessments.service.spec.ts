import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
    service = new EsbeuAssessmentsService({ esbeuAssessment: repository } as unknown as PrismaService,
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
});
