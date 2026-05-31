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
  social_support: number;
  family_expectation: number;
  financial_stress: number;
}

export interface StoredAssessmentIndicators {
  date: Date;
  studyHours: number;
  sleepHours: number;
  workHours: number;
  pendingTasks: number;
  hasImportantExamOrDelivery: boolean;
  sleepQuality: number;
  stressLevel: number;
  tirednessLevel: number;
  anxietyLevel: number;
  academicPerformance: number;
  examPressure: number;
  screenTime: number;
  socialSupport: number;
  financialStress: number;
  physicalActivity: number;
  motivationLevel: number;
  mood?: string;
  dailyDescription?: string;
}

const NEUTRAL_SCORE = 5;
const DATASET_ACADEMIC_PERFORMANCE_MIN = 50;
const DATASET_ACADEMIC_PERFORMANCE_MAX = 90;
const DATASET_PHYSICAL_ACTIVITY_MAX = 7;

export class BurnoutFeatureMapper {
  /**
   * Central mapping from the daily record UI to the saved model features.
   *
   * Direct fields: study_hours, stress_level, screen_time, social_support,
   * financial_stress, exam_pressure.
   * UI scale conversions: academic_performance is collected as 0-10 and mapped
   * to the dataset grade-like range around 50-90; physical_activity is collected
   * as 0-10 and mapped to the dataset 0-7 range.
   * Dataset compatibility note: the saved model feature is named sleep_quality,
   * but it is populated from the dataset column sleep_hours during training.
   * Derived fields: anxiety_score comes from stress and academic pressure;
   * depression_score comes from tiredness and sleep risk. family_expectation
   * and optional sources not collected by the frontend use the midpoint of the
   * 0-10 scale.
   * The contextual mood text is stored with the assessment, but is not mapped into
   * any model feature because the training dataset has no equivalent mood column.
   */
  static toAiServicePayload(indicators: PredictBurnoutDto): AiPredictionRequest {
    const stored = this.toStoredAssessment(indicators);
    const sleepHours = clampNumber(indicators.sleepHours ?? indicators.sleepQuality, 0, 24);

    return {
      study_hours: stored.studyHours,
      academic_performance: toDatasetAcademicPerformance(stored.academicPerformance),
      exam_pressure: deriveExamPressure(indicators, stored.stressLevel),
      stress_level: stored.stressLevel,
      anxiety_score: stored.anxietyLevel,
      depression_score: clampInt(indicators.depressionScore ?? deriveDepressionScore(stored.tirednessLevel, indicators.sleepHours), 0, 10),
      sleep_quality: sleepHours,
      physical_activity: toDatasetPhysicalActivity(stored.physicalActivity),
      screen_time: stored.screenTime,
      social_support: stored.socialSupport,
      family_expectation: clampInt(indicators.familyExpectation ?? NEUTRAL_SCORE, 0, 10),
      financial_stress: stored.financialStress,
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
      date: parseAssessmentDate(indicators.date),
      studyHours,
      sleepHours: clampNumber(indicators.sleepHours ?? indicators.sleepQuality, 0, 24),
      workHours,
      pendingTasks,
      hasImportantExamOrDelivery: hasImportantExamOrDelivery(indicators),
      sleepQuality: clampInt(indicators.sleepQuality ?? deriveSleepQuality(indicators.sleepHours), 0, 10),
      stressLevel,
      tirednessLevel,
      anxietyLevel: clampInt(indicators.anxietyLevel ?? deriveAnxietyLevel(stressLevel, deriveExamPressure(indicators, stressLevel)), 0, 10),
      academicPerformance,
      examPressure: deriveExamPressure(indicators, stressLevel),
      screenTime: clampNumber(indicators.screenTime ?? studyHours + workHours, 0, 24),
      socialSupport: clampInt(indicators.socialSupport ?? NEUTRAL_SCORE, 0, 10),
      financialStress: clampInt(indicators.financialStress ?? deriveFinancialStress(workHours), 0, 10),
      physicalActivity: clampInt(indicators.physicalActivity ?? derivePhysicalActivity(tirednessLevel), 0, 10),
      motivationLevel: clampInt(indicators.motivationLevel ?? NEUTRAL_SCORE, 0, 10),
      mood: indicators.mood,
      dailyDescription: indicators.dailyDescription,
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

function parseAssessmentDate(date: string | undefined): Date {
  if (!date) {
    return new Date();
  }

  const dateValue = date.includes('T') ? date : `${date}T12:00:00.000Z`;
  const parsedDate = new Date(dateValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return new Date();
  }

  return parsedDate;
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

function deriveAnxietyLevel(stressLevel: number, examPressure: number): number {
  return clampInt(stressLevel * 0.65 + examPressure * 0.35, 0, 10);
}

function deriveDepressionScore(tirednessLevel: number, sleepHours: number | undefined): number {
  const sleep = clampNumber(sleepHours ?? 7, 0, 24);
  const shortSleepPenalty = sleep < 6 ? (6 - sleep) * 0.9 : 0;
  const excessSleepPenalty = sleep > 10 ? Math.min(2, (sleep - 10) * 0.6) : 0;
  return clampInt(tirednessLevel * 0.75 + shortSleepPenalty + excessSleepPenalty, 0, 10);
}

function toDatasetAcademicPerformance(uiScore: number): number {
  const normalized = clampNumber(uiScore, 0, 10) / 10;
  return DATASET_ACADEMIC_PERFORMANCE_MIN + normalized * (DATASET_ACADEMIC_PERFORMANCE_MAX - DATASET_ACADEMIC_PERFORMANCE_MIN);
}

function toDatasetPhysicalActivity(uiScore: number): number {
  return (clampNumber(uiScore, 0, 10) / 10) * DATASET_PHYSICAL_ACTIVITY_MAX;
}

function deriveFinancialStress(workHours: number): number {
  if (workHours >= 8) {
    return 7;
  }

  return workHours > 0 ? 5 : 3;
}

function derivePhysicalActivity(tirednessLevel: number): number {
  return tirednessLevel >= 8 ? 1 : 5;
}

