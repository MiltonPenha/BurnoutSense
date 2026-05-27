import { PredictBurnoutDto } from './dto/predict-burnout.dto';

export interface AiPredictionRequest {
  study_hours: number;
  academic_performance: number;
  exam_pressure: number;
  stress_level: number;
  anxiety_score: number;
  depression_score: number;
  sleep_quality: number;
  physical_activity: number;
  screen_time: number;
  internet_usage: number;
  social_support: number;
  family_expectation: number;
  financial_stress: number;
  dropout_risk: number;
}

export interface StoredAssessmentIndicators {
  studyHours: number;
  sleepQuality: number;
  stressLevel: number;
  anxietyLevel: number;
  academicPerformance: number;
  screenTime: number;
  socialSupport: number;
  financialStress: number;
  physicalActivity: number;
  motivationLevel: number;
}

const NEUTRAL_SCORE = 5;

export class BurnoutFeatureMapper {
  /**
   * Central mapping from the daily record UI to the 14 model features.
   *
   * Direct fields: study_hours, stress_level, screen_time, social_support,
   * financial_stress, academic_performance, exam_pressure, physical_activity.
   * Dataset compatibility note: the saved model feature is named sleep_quality,
   * but it is populated from the dataset column sleep_hours during training.
   * Derived fields: anxiety_score, depression_score, internet_usage, dropout_risk.
   * Neutral defaults: family_expectation and any optional derived source not sent
   * by the frontend use the midpoint of the 0-10 scale.
   */
  static toAiServicePayload(indicators: PredictBurnoutDto): AiPredictionRequest {
    const stored = this.toStoredAssessment(indicators);
    const sleepHours = clampNumber(indicators.sleepHours ?? indicators.sleepQuality, 0, 24);

    return {
      study_hours: stored.studyHours,
      academic_performance: stored.academicPerformance,
      exam_pressure: deriveExamPressure(indicators, stored.stressLevel),
      stress_level: stored.stressLevel,
      anxiety_score: stored.anxietyLevel,
      depression_score: clampInt(
        indicators.depressionScore ?? deriveDepressionScore(indicators.mood, stored.motivationLevel, indicators.tirednessLevel),
        0,
        10,
      ),
      sleep_quality: sleepHours,
      physical_activity: stored.physicalActivity,
      screen_time: stored.screenTime,
      internet_usage: clampNumber(indicators.internetUsage ?? stored.screenTime, 0, 24),
      social_support: stored.socialSupport,
      family_expectation: clampInt(indicators.familyExpectation ?? NEUTRAL_SCORE, 0, 10),
      financial_stress: stored.financialStress,
      dropout_risk: clampInt(
        indicators.dropoutRisk ?? deriveDropoutRisk(stored.academicPerformance, stored.stressLevel, stored.financialStress),
        0,
        10,
      ),
    };
  }

  static toStoredAssessment(indicators: PredictBurnoutDto): StoredAssessmentIndicators {
    const stressLevel = clampInt(indicators.stressLevel, 0, 10);
    const tirednessLevel = clampInt(indicators.tirednessLevel ?? stressLevel, 0, 10);
    const studyHours = clampNumber(indicators.studyHours, 0, 24);
    const workHours = clampNumber(indicators.workHours ?? 0, 0, 24);
    const pendingTasks = clampInt(indicators.pendingTasks ?? 0, 0, 30);
    const academicPerformance = clampInt(
      indicators.academicPerformance ?? deriveAcademicPerformance(pendingTasks, hasImportantExamOrDelivery(indicators)),
      0,
      10,
    );

    return {
      studyHours,
      sleepQuality: clampInt(indicators.sleepQuality ?? deriveSleepQuality(indicators.sleepHours), 0, 10),
      stressLevel,
      anxietyLevel: clampInt(indicators.anxietyLevel ?? deriveAnxietyLevel(indicators.mood, stressLevel, tirednessLevel), 0, 10),
      academicPerformance,
      screenTime: clampNumber(indicators.screenTime ?? studyHours + workHours, 0, 24),
      socialSupport: clampInt(indicators.socialSupport ?? deriveSocialSupport(indicators.mood), 0, 10),
      financialStress: clampInt(indicators.financialStress ?? deriveFinancialStress(workHours), 0, 10),
      physicalActivity: clampInt(indicators.physicalActivity ?? derivePhysicalActivity(tirednessLevel), 0, 7),
      motivationLevel: clampInt(indicators.motivationLevel ?? deriveMotivationLevel(indicators.mood, tirednessLevel), 0, 10),
    };
  }

  static mainFactors(features: AiPredictionRequest): string[] {
    const factors: string[] = [];

    if (features.stress_level >= 8) {
      factors.push('Nivel de estresse elevado');
    }

    if (features.sleep_quality < 6) {
      factors.push('Poucas horas de sono');
    }

    if (features.exam_pressure >= 7 || features.study_hours >= 8) {
      factors.push('Alta carga academica');
    }

    if (features.screen_time >= 8) {
      factors.push('Tempo de tela elevado');
    }

    if (features.social_support <= 4) {
      factors.push('Baixo suporte social');
    }

    if (features.financial_stress >= 7) {
      factors.push('Estresse financeiro elevado');
    }

    if (features.physical_activity <= 1) {
      factors.push('Baixa atividade fisica');
    }

    return factors.length > 0 ? factors : ['Indicadores dentro de uma faixa menos critica'];
  }
}

function clampNumber(value: number | undefined, min: number, max: number): number {
  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return min;
  }

  return Math.min(max, Math.max(min, numberValue));
}

function clampInt(value: number | undefined, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

function hasImportantExamOrDelivery(indicators: PredictBurnoutDto): boolean {
  return indicators.hasImportantExamOrDelivery ?? indicators.importantDelivery ?? false;
}

function deriveAcademicPerformance(pendingTasks: number, importantDelivery: boolean): number {
  return 10 - Math.min(pendingTasks, 7) - (importantDelivery ? 1 : 0);
}

function deriveExamPressure(indicators: PredictBurnoutDto, stressLevel: number): number {
  if (indicators.examPressure !== undefined) {
    return clampInt(indicators.examPressure, 0, 10);
  }

  const pendingTasks = clampInt(indicators.pendingTasks ?? 0, 0, 30);
  const importantDeliveryPressure = hasImportantExamOrDelivery(indicators) ? 2 : 0;
  return clampInt(NEUTRAL_SCORE + importantDeliveryPressure + Math.min(pendingTasks, 5) * 0.5 + (stressLevel >= 8 ? 1 : 0), 0, 10);
}

function deriveSleepQuality(sleepHours: number | undefined): number {
  const hours = clampNumber(sleepHours ?? 7, 0, 24);

  if (hours >= 7 && hours <= 9) {
    return 8;
  }

  if (hours >= 6 && hours < 7) {
    return 6;
  }

  if (hours > 9 && hours <= 10) {
    return 6;
  }

  return 4;
}

function deriveAnxietyLevel(mood: string | undefined, stressLevel: number, tirednessLevel: number): number {
  const moodMap: Record<string, number> = {
    Feliz: 2,
    Calmo: 3,
    Ansioso: Math.max(8, stressLevel),
    Triste: Math.max(6, tirednessLevel),
    Irritado: Math.max(7, stressLevel),
    Cansado: Math.max(5, tirednessLevel),
    Desmotivado: Math.max(6, tirednessLevel),
  };

  return moodMap[mood ?? ''] ?? Math.max(NEUTRAL_SCORE, stressLevel);
}

function deriveDepressionScore(mood: string | undefined, motivationLevel: number, tirednessLevel: number | undefined): number {
  const tiredness = clampInt(tirednessLevel ?? NEUTRAL_SCORE, 0, 10);
  const moodMap: Record<string, number> = {
    Feliz: 2,
    Calmo: 2,
    Ansioso: 5,
    Triste: 8,
    Irritado: 5,
    Cansado: Math.max(5, tiredness),
    Desmotivado: 8,
  };

  return moodMap[mood ?? ''] ?? Math.max(NEUTRAL_SCORE, 10 - motivationLevel);
}

function deriveSocialSupport(mood: string | undefined): number {
  return ['Feliz', 'Calmo'].includes(mood ?? '') ? 8 : NEUTRAL_SCORE;
}

function deriveFinancialStress(workHours: number): number {
  if (workHours >= 8) {
    return 7;
  }

  return workHours > 0 ? 5 : 3;
}

function derivePhysicalActivity(tirednessLevel: number): number {
  return tirednessLevel >= 8 ? 1 : 3;
}

function deriveMotivationLevel(mood: string | undefined, tirednessLevel: number): number {
  const moodMap: Record<string, number> = {
    Feliz: 9,
    Calmo: 8,
    Ansioso: 5,
    Triste: 4,
    Irritado: 5,
    Cansado: 4,
    Desmotivado: 2,
  };

  const base = moodMap[mood ?? ''] ?? 6;
  return base - Math.max(0, tirednessLevel - 7);
}

function deriveDropoutRisk(academicPerformance: number, stressLevel: number, financialStress: number): number {
  const performanceRisk = Math.max(0, 10 - academicPerformance) * 0.45;
  const stressRisk = stressLevel * 0.35;
  const financialRisk = financialStress * 0.2;
  return Math.round(performanceRisk + stressRisk + financialRisk);
}
