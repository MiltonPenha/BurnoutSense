import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatusService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getStatus() {
    const [database, aiService, model] = await Promise.all([this.checkDatabase(), this.checkAiService(), this.checkModel()]);

    return {
      backend: {
        status: 'online',
      },
      database,
      aiService,
      model,
      checkedAt: new Date().toISOString(),
    };
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'online' };
    } catch {
      return { status: 'offline' };
    }
  }

  private async checkAiService() {
    const aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL');

    if (!aiServiceUrl) {
      return { status: 'not_configured' };
    }

    try {
      const response = await fetch(`${aiServiceUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });

      return { status: response.ok ? 'online' : 'offline' };
    } catch {
      return { status: 'offline' };
    }
  }

  private async checkModel() {
    const aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL');

    if (!aiServiceUrl) {
      return { loaded: false, status: 'not_configured' };
    }

    try {
      const apiKey = this.configService.get<string>('AI_SERVICE_API_KEY');
      if (!apiKey) return { loaded: false, status: 'not_configured' };
      const response = await fetch(`${aiServiceUrl}/v1/model`, {
        headers: { 'X-API-Key': apiKey },
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        return { loaded: false, status: 'unavailable' };
      }

      const modelInfo = (await response.json()) as AiModelInfoResponse;

      return {
        loaded: true,
        status: 'loaded',
        modelName: modelInfo.model_name,
        datasetVersion: modelInfo.dataset_version,
        methodology: 'esbeu_context_regression',
      };
    } catch {
      return { loaded: false, status: 'unavailable' };
    }
  }
}

interface AiModelInfoResponse {
  model_name?: string;
  dataset_version?: string;
}
