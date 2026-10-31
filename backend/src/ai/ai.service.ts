import { BadGatewayException, Injectable, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PredictEsbeuDto } from './dto/predict-esbeu.dto';

export interface ContextPrediction {
  kind: 'estimated_score';
  esbeu_overall: number;
  model_name: string;
  model_version: string;
  dataset_version: string;
  contract_version: 'esbeu-context-regression/1';
}

export interface ObservedEsbeu {
  kind: 'observed_score';
  overall: number;
  emotional_physical_exhaustion: number;
  distancing: number;
  training_inefficacy: number;
}

function validScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 4;
}

@Injectable()
export class AiService {
  constructor(private readonly configService: ConfigService) {}

  async predict(payload: PredictEsbeuDto) {
    const response = await this.request('/v1/predict', payload);
    const value = response.esbeu_overall;
    if (!validScore(value) || response.kind !== 'estimated_score'
      || response.contract_version !== 'esbeu-context-regression/1'
      || !['dummy', 'linear', 'ridge', 'random_forest', 'svr'].includes(String(response.model_name))
      || typeof response.dataset_version !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(response.dataset_version)
      || typeof response.model_version !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(response.model_version)) {
      throw new BadGatewayException('Invalid ESB-eu response from AI service.');
    }
    // Whitelist outputs; never relay an unexpected upstream payload to clients.
    return { kind: 'estimated_score', esbeu_overall: value, model_name: response.model_name,
      model_version: response.model_version, dataset_version: response.dataset_version,
      contract_version: response.contract_version } as ContextPrediction;
  }

  async score(items: Record<string, unknown>): Promise<ObservedEsbeu> {
    const response = await this.request('/v1/esbeu/score', { items });
    const keys = ['overall', 'emotional_physical_exhaustion', 'distancing', 'training_inefficacy'] as const;
    if (response.kind !== 'observed_score' || keys.some((key) => !validScore(response[key]))) {
      throw new BadGatewayException('Invalid observed ESB-eu response from AI service.');
    }
    return { kind: 'observed_score', overall: response.overall, emotional_physical_exhaustion: response.emotional_physical_exhaustion,
      distancing: response.distancing, training_inefficacy: response.training_inefficacy } as ObservedEsbeu;
  }

  async formSchema() {
    const response = await this.request('/v1/schema');
    if (response.form_version !== 'forms/1.0' || response.contract_version !== 'esbeu-context-regression/1'
      || !Array.isArray(response.fields) || response.fields.length !== 36) {
      throw new BadGatewayException('Invalid ESB-eu form schema.');
    }
    return response;
  }

  modelInfo() {
    return this.request('/v1/model');
  }

  modelMetrics() {
    return this.request('/v1/validation/metrics');
  }

  private async request(path: string, payload?: object): Promise<Record<string, unknown>> {
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
