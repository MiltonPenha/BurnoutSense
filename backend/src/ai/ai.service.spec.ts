import { BadGatewayException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';

describe('Independent ESB-eu HTTP client', () => {
  let service: AiService;
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    const values: Record<string, string> = { AI_SERVICE_URL: 'http://independent-ai:8000', AI_SERVICE_API_KEY: 'artificial-test-secret' };
    service = new AiService({ get: (key: string) => values[key] } as ConfigService);
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('sends context by HTTP and preserves continuous output', async () => {
    const result = { kind: 'estimated_score', esbeu_overall: 1.75, model_name: 'ridge', dataset_version: 'artificial-test' };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    await expect(service.predict({ context: { artificial: 1 } })).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith('http://independent-ai:8000/v1/predict', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ context: { artificial: 1 } }),
      headers: expect.objectContaining({ 'X-API-Key': 'artificial-test-secret' }),
    }));
  });

  it('does not fabricate a result when the separate service is offline', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(service.predict({ context: {} })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('propagates validation rejection without exposing upstream payload', async () => {
    fetchMock.mockResolvedValue(new Response('artificial-private-marker', { status: 422 }));
    await expect(service.predict({ context: {} })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it.each([-1, 5, '2', null])('rejects invalid continuous output %p', async (value) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ kind: 'estimated_score', esbeu_overall: value }), { status: 200 }));
    await expect(service.predict({ context: {} })).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('fails closed when the independent service is not configured', async () => {
    const unconfigured = new AiService({ get: () => undefined } as unknown as ConfigService);
    await expect(unconfigured.modelInfo()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests model and validation metadata by HTTP', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await service.modelMetrics();
    expect(fetchMock).toHaveBeenCalledWith('http://independent-ai:8000/v1/validation/metrics', expect.objectContaining({ method: 'GET' }));
  });
});
