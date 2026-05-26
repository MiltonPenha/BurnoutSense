import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RiskLevel } from '@prisma/client';
import { PredictBurnoutDto } from './dto/predict-burnout.dto';

export interface PredictionOutput {
  riskLevel: RiskLevel;
  confidence: number;
  mainFactors: string[];
  modelVersion: string;
  disclaimer: string;
}

@Injectable()
export class AiService {
  private readonly preventiveDisclaimer =
    'This result is a preventive computational estimate and is not a clinical diagnosis.';

  constructor(private readonly configService: ConfigService) {}

  async predict(indicators: PredictBurnoutDto): Promise<PredictionOutput> {
    const aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL');

    if (!aiServiceUrl) {
      throw new ServiceUnavailableException('AI_SERVICE_URL is not configured.');
    }

    const prediction = await this.requestPrediction(aiServiceUrl, indicators);
    const riskLevel = this.normalizeRiskLevel(prediction.risk_level);
    const mainFactors = this.getMainFactors(indicators);
    const confidence = await this.getModelConfidence(aiServiceUrl, prediction.risk_level);

    return {
      riskLevel,
      confidence,
      mainFactors,
      modelVersion: prediction.model_used,
      disclaimer: this.preventiveDisclaimer,
    };
  }

  private async requestPrediction(aiServiceUrl: string, indicators: PredictBurnoutDto) {
    try {
      const response = await fetch(`${aiServiceUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.toAiServicePayload(indicators)),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new BadGatewayException(`AI service prediction failed with status ${response.status}.`);
      }

      return (await response.json()) as AiPredictionResponse;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new ServiceUnavailableException('AI service is unavailable.');
    }
  }

  private toAiServicePayload(indicators: PredictBurnoutDto): AiPredictionRequest {
    return {
      study_hours: indicators.studyHours,
      sleep_quality: indicators.sleepQuality,
      stress_level: indicators.stressLevel,
      screen_time: indicators.screenTime,
      social_support: indicators.socialSupport,
      financial_stress: indicators.financialStress,
      academic_performance: indicators.academicPerformance,
      anxiety_score: indicators.anxietyLevel,
      physical_activity: indicators.physicalActivity,
    };
  }

  private normalizeRiskLevel(riskLevel: string): RiskLevel {
    const normalizedRiskLevel = riskLevel.toUpperCase();

    if (!Object.values(RiskLevel).includes(normalizedRiskLevel as RiskLevel)) {
      throw new BadGatewayException(`AI service returned an unknown risk level: ${riskLevel}.`);
    }

    return normalizedRiskLevel as RiskLevel;
  }

  private async getModelConfidence(aiServiceUrl: string, riskLevel: string): Promise<number> {
    try {
      const response = await fetch(`${aiServiceUrl}/model-metrics`, {
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        return 0;
      }

      const metrics = (await response.json()) as AiModelMetricsResponse;
      const classMetric = metrics.per_class_metrics?.[riskLevel.toLowerCase()]?.f1_score;
      const summaryMetric = metrics.metrics_summary?.f1_score;
      const confidence = classMetric ?? summaryMetric ?? 0;

      return Number(Math.min(Math.max(confidence, 0), 1).toFixed(4));
    } catch {
      return 0;
    }
  }

  private getMainFactors(indicators: PredictBurnoutDto): string[] {
    const factors: string[] = [];

    if (indicators.stressLevel >= 8) {
      factors.push('alto nível de estresse');
    }

    if (indicators.anxietyLevel >= 7) {
      factors.push('alto nível de ansiedade');
    }

    if (indicators.sleepQuality <= 4) {
      factors.push('baixa qualidade do sono');
    }

    if (indicators.socialSupport <= 4) {
      factors.push('baixo suporte social');
    }

    if (indicators.studyHours >= 8) {
      factors.push('alta carga de estudos');
    }

    if (indicators.academicPerformance <= 5) {
      factors.push('baixo desempenho acadêmico');
    }

    if (indicators.screenTime >= 8) {
      factors.push('tempo de tela elevado');
    }

    if (indicators.financialStress >= 7) {
      factors.push('alto estresse financeiro');
    }

    if (indicators.motivationLevel <= 4) {
      factors.push('baixa motivação acadêmica');
    }

    return factors.length > 0 ? factors : ['indicadores dentro de uma faixa menos critica'];
  }

}

interface AiPredictionRequest {
  study_hours: number;
  sleep_quality: number;
  stress_level: number;
  screen_time: number;
  social_support: number;
  financial_stress: number;
  academic_performance: number;
  anxiety_score: number;
  physical_activity: number;
}

interface AiPredictionResponse {
  risk_level: string;
  model_used: string;
}

interface AiModelMetricsResponse {
  metrics_summary?: {
    f1_score?: number;
  };
  per_class_metrics?: Record<
    string,
    {
      f1_score?: number;
    }
  >;
}
