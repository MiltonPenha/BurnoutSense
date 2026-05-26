import { Injectable } from '@nestjs/common';
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
  private readonly simulatedModelVersion = 'mock-v1';
  private readonly preventiveDisclaimer =
    'This result is a preventive computational estimate and is not a clinical diagnosis.';

  predict(indicators: PredictBurnoutDto): PredictionOutput {
    const mainFactors = this.getMainFactors(indicators);
    const riskLevel = this.getRiskLevel(indicators);
    const confidence = this.getConfidence(mainFactors.length, riskLevel);

    return {
      riskLevel,
      confidence,
      mainFactors,
      modelVersion: this.simulatedModelVersion,
      disclaimer: this.preventiveDisclaimer,
    };
  }

  private getRiskLevel(indicators: PredictBurnoutDto): RiskLevel {
    if (
      indicators.stressLevel >= 8 &&
      indicators.sleepQuality <= 4 &&
      indicators.socialSupport <= 4
    ) {
      return RiskLevel.HIGH;
    }

    if (indicators.stressLevel >= 6 || indicators.anxietyLevel >= 6 || indicators.sleepQuality <= 5) {
      return RiskLevel.MEDIUM;
    }

    return RiskLevel.LOW;
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

  private getConfidence(factorCount: number, riskLevel: RiskLevel): number {
    const baseConfidenceByRisk: Record<RiskLevel, number> = {
      [RiskLevel.LOW]: 0.62,
      [RiskLevel.MEDIUM]: 0.7,
      [RiskLevel.HIGH]: 0.78,
    };

    const confidence = baseConfidenceByRisk[riskLevel] + Math.min(factorCount, 5) * 0.04;
    return Number(Math.min(confidence, 0.95).toFixed(2));
  }
}
