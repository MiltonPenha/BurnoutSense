import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GuidanceService } from './guidance.service';

describe('Gemini self-care guidance', () => {
  let findFirst: jest.Mock;
  let service: GuidanceService;
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const config = { GEMINI_API_KEY: 'fictional-api-key', GEMINI_MODEL: 'gemini-3.1-flash-lite', GEMINI_GUIDANCE_ENABLED: 'true' };
  const items = (prefix: string, count = 2) => Array.from({ length: count }, (_, i) => ({ title: `${prefix} ${i}`, text: `Uma ação fictícia e acolhedora ${prefix} ${i}.` }));
  function response(content: unknown, finishReason = 'STOP') {
    return { ok: true, json: async () => ({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(content) }] } }] }) };
  }
  beforeEach(() => {
    findFirst = jest.fn().mockResolvedValue({ estimatedOverall: 1.5 });
    service = new GuidanceService({ esbeuAssessment: { findFirst } } as unknown as PrismaService,
      { get: (key: keyof typeof config) => config[key] } as unknown as ConfigService);
    global.fetch = fetchMock;
    fetchMock.mockReset().mockResolvedValue(response({ tips: items('Dica'), recommendations: items('Recomendação') }));
  });
  afterAll(() => { global.fetch = originalFetch; });

  it('verifies ownership and sends only the anonymous index to the official provider', async () => {
    const value = await service.forAssessment('fictional-owner', 'fictional-assessment');
    expect(value.status).toBe('ready');
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'fictional-assessment', userId: 'fictional-owner' }, select: { estimatedOverall: true } });
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent');
    const body = JSON.parse(String(request.body));
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual({ indicatorPercentage: 37.5, itemsPerList: 2 });
    expect(request.body).not.toContain('fictional-owner');
    expect(request.body).not.toContain('fictional-assessment');
    expect(url).not.toContain(config.GEMINI_API_KEY);
  });
  it('never calls Gemini for records belonging to someone else', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.forAssessment('other-owner', 'id')).rejects.toBeInstanceOf(NotFoundException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('deduplicates concurrent requests and reuses anonymous successful content', async () => {
    const [one, two] = await Promise.all([service.forAssessment('a', 'first'), service.forAssessment('b', 'second')]);
    expect(one.status).toBe('ready'); expect(two.assessmentId).toBe('second');
    await service.forAssessment('a', 'third');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('refreshes guidance when the index changes', async () => {
    await service.forAssessment('owner', 'a');
    findFirst.mockResolvedValue({ estimatedOverall: 2 });
    await service.forAssessment('owner', 'b');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('asks for exactly three suggestions per list for a higher index', async () => {
    findFirst.mockResolvedValue({ estimatedOverall: 3.2 });
    fetchMock.mockResolvedValue(response({ tips: items('Dica', 3), recommendations: items('Recomendação', 3) }));
    const result = await service.forAssessment('owner', 'id');
    expect(result.status).toBe('ready');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual({ indicatorPercentage: 80, itemsPerList: 3 });
  });
  it.each([NaN, Infinity, -1, 4.1])('never fabricates guidance for an invalid score %s', async score => {
    findFirst.mockResolvedValue({ estimatedOverall: score });
    expect((await service.forAssessment('owner', 'id')).status).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('has an explicit disabled state without a synthetic fallback', async () => {
    service = new GuidanceService({ esbeuAssessment: { findFirst } } as unknown as PrismaService, { get: () => undefined } as unknown as ConfigService);
    expect((await service.forAssessment('owner', 'id')).status).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sanitizes provider failures and backs off repeated requests', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    const result = await service.forAssessment('owner', 'id');
    expect(result.status).toBe('rate_limited');
    await service.forAssessment('owner', 'id');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('fictional-api-key');
  });
  it.each([
    { tips: [], recommendations: items('R') },
    { tips: items('D'), recommendations: items('D') },
    { tips: [{ title: 'Não seguro', text: '<script>conteúdo inválido</script>' }, ...items('D', 1)], recommendations: items('R') },
    { tips: [{ title: 'Muito longo', text: 'x'.repeat(181) }, ...items('D', 1)], recommendations: items('R') },
  ])('rejects invalid, repeated, overlong or HTML content', async content => {
    fetchMock.mockResolvedValue(response(content));
    expect((await service.forAssessment('owner', 'id')).status).toBe('unavailable');
  });
  it('does not display a blocked or truncated response', async () => {
    fetchMock.mockResolvedValue(response({ tips: items('D'), recommendations: items('R') }, 'MAX_TOKENS'));
    expect((await service.forAssessment('owner', 'id')).status).toBe('unavailable');
  });
  it('does not leak network errors', async () => {
    fetchMock.mockRejectedValue(new Error('fictional-secret-response'));
    const result = await service.forAssessment('owner', 'id');
    expect(result.status).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('fictional-secret-response');
  });
});
