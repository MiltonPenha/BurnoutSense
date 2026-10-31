import { BadGatewayException, Injectable, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PredictEsbeuDto } from './dto/predict-esbeu.dto';

@Injectable()
export class AiService {
  constructor(private readonly configService: ConfigService) {}

  async predict(payload: PredictEsbeuDto) {
    const response = await this.request('/v1/predict', payload);
    const value = response.esbeu_overall;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 4
      || response.kind !== 'estimated_score') {
      throw new BadGatewayException('Invalid ESB-eu response from AI service.');
    }
    return response;
  }

  modelInfo() {
    return this.request('/v1/model');
  }

  modelMetrics() {
    return this.request('/v1/validation/metrics');
  }

  private async request(path: string, payload?: PredictEsbeuDto): Promise<Record<string, unknown>> {
    const baseUrl = this.configService.get<string>('AI_SERVICE_URL');
    const apiKey = this.configService.get<string>('AI_SERVICE_API_KEY');
    if (!baseUrl || !apiKey) {
      throw new ServiceUnavailableException('Independent ESB-eu service is not configured.');
    }
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
        method: payload ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 422) {
        throw new UnprocessableEntityException('Contexto inválido ou estimativa fora de 0–4.');
      }
      if (!response.ok) {
        throw new ServiceUnavailableException('Independent ESB-eu service is unavailable.');
      }
      const result: unknown = await response.json();
      if (result === null || typeof result !== 'object' || Array.isArray(result)) {
        throw new ServiceUnavailableException('Invalid response from independent ESB-eu service.');
      }
      return result as Record<string, unknown>;
    } catch (error) {
      if (error instanceof UnprocessableEntityException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('Independent ESB-eu service is unavailable.');
    }
  }
}
