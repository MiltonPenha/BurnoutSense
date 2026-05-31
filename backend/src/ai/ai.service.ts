import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RiskLevel } from '@prisma/client';
import { AiPredictionRequest, BurnoutFeatureMapper } from './burnout-feature.mapper';
import { PredictBurnoutDto } from './dto/predict-burnout.dto';

export interface PredictionOutput {
  riskLevel: RiskLevel;
  confidence: number;
  riskScore: number;
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

    const aiPayload = BurnoutFeatureMapper.toAiServicePayload(indicators);
    const prediction = await this.requestPrediction(aiServiceUrl, aiPayload);
    const modelRiskLevel = this.normalizeRiskLevel(prediction.risk_level);
    const calibratedRiskLevel = this.calibratePreventiveRisk(modelRiskLevel, aiPayload);
    const mainFactors = prediction.main_factors?.length ? prediction.main_factors : BurnoutFeatureMapper.mainFactors(aiPayload);
    const confidence = prediction.confidence ?? (await this.getModelConfidence(aiServiceUrl, prediction.risk_level));
    const modelRiskScore = this.normalizeRiskScore(
      prediction.risk_score ?? this.scoreFromRiskLevelAndConfidence(modelRiskLevel, confidence),
    );
    const calibrated = calibratedRiskLevel !== modelRiskLevel;
    const riskScore = calibrated ? Math.max(modelRiskScore, this.calibratePreventiveRiskScore(aiPayload)) : modelRiskScore;

    return {
      riskLevel: calibratedRiskLevel,
      confidence,
      riskScore: this.normalizeRiskScore(riskScore),
      mainFactors: calibrated ? ['Combinação severa de sono, estresse e pressão acadêmica', ...mainFactors] : mainFactors,
      modelVersion: calibrated ? `${prediction.model_used} + preventive calibration` : prediction.model_used,
      disclaimer: this.preventiveDisclaimer,
    };
  }

  private async requestPrediction(aiServiceUrl: string, indicators: AiPredictionRequest) {
    try {
      const response = await fetch(`${aiServiceUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(indicators),
        signal: AbortSignal.timeout(30_000),
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

  private normalizeRiskLevel(riskLevel: string): RiskLevel {
    const normalizedRiskLevel = riskLevel.toUpperCase();

    if (!Object.values(RiskLevel).includes(normalizedRiskLevel as RiskLevel)) {
      throw new BadGatewayException(`AI service returned an unknown risk level: ${riskLevel}.`);
    }

    return normalizedRiskLevel as RiskLevel;
  }

  private normalizeRiskScore(riskScore: number): number {
    return Number(Math.min(Math.max(riskScore, 1), 10).toFixed(1));
  }

  private scoreFromRiskLevelAndConfidence(riskLevel: RiskLevel, confidence: number): number {
    const chanceFloor = 1 / 3;
    const confidenceRatio = Math.min(1, Math.max(0, (confidence - chanceFloor) / (1 - chanceFloor)));

    if (riskLevel === RiskLevel.LOW) {
      return this.normalizeRiskScore(4 - 3 * confidenceRatio);
    }

    if (riskLevel === RiskLevel.MEDIUM) {
      return this.normalizeRiskScore(5 + 2 * confidenceRatio);
    }

    return this.normalizeRiskScore(8 + 2 * confidenceRatio);
  }

  private calibratePreventiveRisk(riskLevel: RiskLevel, indicators: AiPredictionRequest): RiskLevel {
    if (riskLevel === RiskLevel.HIGH) {
      return riskLevel;
    }

    const severeAcademicOverload =
      indicators.stress_level >= 9 &&
      indicators.sleep_quality <= 4 &&
      indicators.exam_pressure >= 8;
    const severeRecoveryRisk =
      indicators.stress_level >= 9 &&
      indicators.sleep_quality <= 3 &&
      indicators.physical_activity <= 2;
    const severeContextRisk =
      indicators.sleep_quality <= 3 &&
      indicators.exam_pressure >= 9 &&
      (indicators.financial_stress >= 7 || indicators.social_support <= 3);

    if (severeAcademicOverload || severeRecoveryRisk || severeContextRisk) {
      return RiskLevel.HIGH;
    }

    return riskLevel;
  }

  private calibratePreventiveRiskScore(indicators: AiPredictionRequest): number {
    const sleepRisk = Math.min(1, Math.max(0, (7 - indicators.sleep_quality) / 7));
    const stressRisk = indicators.stress_level / 10;
    const pressureRisk = indicators.exam_pressure / 10;
    const supportRisk = Math.min(1, Math.max(0, (5 - indicators.social_support) / 5));
    const activityRisk = Math.min(1, Math.max(0, (3 - indicators.physical_activity) / 3));
    const financialRisk = indicators.financial_stress / 10;
    const severity =
      stressRisk * 0.35 +
      pressureRisk * 0.25 +
      sleepRisk * 0.2 +
      supportRisk * 0.1 +
      activityRisk * 0.05 +
      financialRisk * 0.05;

    return this.normalizeRiskScore(8 + Math.min(1, severity) * 2);
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
}

interface AiPredictionResponse {
  risk_level: string;
  confidence?: number;
  risk_score?: number;
  model_used: string;
  main_factors?: string[];
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
