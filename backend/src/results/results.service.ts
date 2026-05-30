import { BadGatewayException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async findByAssessmentId(userId: string, assessmentId: string) {
    const result = await this.prisma.predictionResult.findFirst({
      where: {
        assessmentId,
        assessment: {
          userId,
        },
      },
    });

    if (!result) {
      throw new NotFoundException('Prediction result not found.');
    }

    return {
      ...result,
      disclaimer:
        'This result is a preventive computational estimate and is not a clinical diagnosis.',
    };
  }

  async generateInsights(userId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, userId },
      include: { result: true },
    });

    if (!assessment?.result) {
      throw new NotFoundException('Prediction result not found.');
    }

    const previousAssessment = await this.prisma.assessment.findFirst({
      where: {
        userId,
        date: { lt: assessment.date },
      },
      include: { result: true },
      orderBy: { date: 'desc' },
    });

    return this.requestGeneratedInsights({
      currentAssessment: {
        sleepHours: assessment.sleepHours,
        sleepQuality: assessment.sleepQuality,
        studyHours: assessment.studyHours,
        screenTime: assessment.screenTime,
        stressLevel: assessment.stressLevel,
        tirednessLevel: assessment.tirednessLevel,
        socialSupport: assessment.socialSupport,
        financialStress: assessment.financialStress,
        physicalActivity: assessment.physicalActivity,
        mood: assessment.mood,
        hasImportantExamOrDelivery: assessment.hasImportantExamOrDelivery,
      },
      previousAssessment: previousAssessment
        ? {
            sleepHours: previousAssessment.sleepHours,
            sleepQuality: previousAssessment.sleepQuality,
            studyHours: previousAssessment.studyHours,
            screenTime: previousAssessment.screenTime,
            stressLevel: previousAssessment.stressLevel,
            tirednessLevel: previousAssessment.tirednessLevel,
            socialSupport: previousAssessment.socialSupport,
            physicalActivity: previousAssessment.physicalActivity,
            riskLevel: previousAssessment.result?.riskLevel,
          }
        : null,
      prediction: {
        riskLevel: assessment.result.riskLevel,
        confidence: assessment.result.confidence,
        mainFactors: assessment.result.mainFactors,
        modelVersion: assessment.result.modelVersion,
      },
      constraints: {
        language: 'pt-BR',
        purpose: 'apoio preventivo acadêmico',
        avoidDiagnosis: true,
        avoidRawScores: true,
        maxAlerts: 4,
        maxRecommendations: 3,
      },
    });
  }

  private async requestGeneratedInsights(context: InsightGenerationContext) {
    const geminiApiKey = this.configService.get<string>('GEMINI_API_KEY') ?? this.configService.get<string>('GOOGLE_API_KEY');
    const geminiModel = this.configService.get<string>('GEMINI_INSIGHTS_MODEL') ?? 'gemini-2.5-flash-lite';
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const model = this.configService.get<string>('OPENAI_INSIGHTS_MODEL') ?? 'gpt-5.4-mini';

    if (geminiApiKey) {
      return this.requestGeminiInsights(context, geminiApiKey, geminiModel);
    }

    if (apiKey) {
      return this.requestOpenAiInsights(context, apiKey, model);
    }

    throw new ServiceUnavailableException('Configure GEMINI_API_KEY or OPENAI_API_KEY to generate dashboard insights.');
  }

  private async requestOpenAiInsights(context: InsightGenerationContext, apiKey: string, model: string) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          'Você gera alertas preventivos e recomendações acadêmicas em português do Brasil.',
          'Não faça diagnóstico clínico, não cite números crus como "0/10" ou contagens derivadas, não invente dados e use apenas o contexto fornecido.',
          `Contexto: ${JSON.stringify(context)}`,
        ].join('\n\n'),
        text: {
          format: {
            type: 'json_schema',
            name: 'burnoutsense_generated_insights',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                alerts: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 4,
                  items: { type: 'string', minLength: 16, maxLength: 180 },
                },
                recommendations: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 3,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      title: { type: 'string', minLength: 8, maxLength: 80 },
                      text: { type: 'string', minLength: 24, maxLength: 220 },
                    },
                    required: ['title', 'text'],
                  },
                },
              },
              required: ['alerts', 'recommendations'],
            },
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as OpenAiErrorResponse | null;
      const errorMessage = errorBody?.error?.message ?? `Generated insights request failed with status ${response.status}.`;

      if (response.status === 401) {
        throw new ServiceUnavailableException('A chave da OpenAI não foi aceita. Verifique OPENAI_API_KEY no backend.');
      }

      if (response.status === 429) {
        throw new ServiceUnavailableException('A conta da OpenAI está sem cota/crédito disponível. Verifique billing e limites do projeto.');
      }

      throw new BadGatewayException(errorMessage);
    }

    const responseBody = (await response.json()) as OpenAiResponsesResponse;
    const outputText = extractOutputText(responseBody);

    if (!outputText) {
      throw new BadGatewayException('Generated insights response did not include text output.');
    }

    return parseGeneratedInsights(outputText, model);
  }

  private async requestGeminiInsights(context: InsightGenerationContext, apiKey: string, model: string) {
    const buildRequestBody = (useJsonMime: boolean) => {
      const requestBody: Record<string, unknown> = {
        contents: [
          {
            parts: [
              {
                text: [
                  'Você gera alertas preventivos e recomendações acadêmicas em português do Brasil.',
                  'Não faça diagnóstico clínico, não cite números crus como "0/10" ou contagens derivadas, não invente dados e use apenas o contexto fornecido.',
                  'Responda somente JSON válido no formato {"alerts":["..."],"recommendations":[{"title":"...","text":"..."}]}.',
                  `Contexto: ${JSON.stringify(context)}`,
                ].join('\n\n'),
              },
            ],
          },
        ],
      };

      if (useJsonMime) {
        requestBody.generationConfig = {
          responseMimeType: 'application/json',
        };
      }

      return requestBody;
    };

    const request = (useJsonMime: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(buildRequestBody(useJsonMime)),
      signal: AbortSignal.timeout(20_000),
    });

    let response = await request(true);

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as GeminiErrorResponse | null;
      const errorMessage = errorBody?.error?.message ?? `Gemini insights request failed with status ${response.status}.`;

      if (response.status === 400 && isGeminiJsonModeError(errorMessage)) {
        response = await request(false);

        if (response.ok) {
          const retryBody = (await response.json()) as GeminiGenerateContentResponse;
          const retryOutputText = extractGeminiOutputText(retryBody);

          if (!retryOutputText) {
            throw new BadGatewayException('Gemini response did not include text output.');
          }

          return parseGeneratedInsights(retryOutputText, model);
        }
      }

      if (response.status === 400) {
        throw new BadGatewayException(`Gemini não aceitou a requisição: ${errorMessage}`);
      }

      if (response.status === 401 || response.status === 403) {
        throw new ServiceUnavailableException('A chave do Gemini não foi aceita. Verifique GEMINI_API_KEY no backend.');
      }

      if (response.status === 429) {
        throw new ServiceUnavailableException('A API Gemini atingiu o limite gratuito ou a cota do projeto. Tente novamente mais tarde.');
      }

      throw new BadGatewayException(errorMessage);
    }

    const responseBody = (await response.json()) as GeminiGenerateContentResponse;
    const outputText = extractGeminiOutputText(responseBody);

    if (!outputText) {
      throw new BadGatewayException('Gemini response did not include text output.');
    }

    return parseGeneratedInsights(outputText, model);
  }
}

function extractOutputText(responseBody: OpenAiResponsesResponse): string {
  if (responseBody.output_text) {
    return responseBody.output_text;
  }

  for (const item of responseBody.output ?? []) {
    for (const content of item.content ?? []) {
      if ((content.type === 'output_text' || content.type === 'text') && content.text) {
        return content.text;
      }
    }
  }

  return '';
}

function isGeminiJsonModeError(errorMessage: string) {
  return /generation_?config|response_?mime|response_?format|mime_?type/i.test(errorMessage);
}

function parseGeneratedInsights(outputText: string, model: string) {
  try {
    const parsed = JSON.parse(outputText) as GeneratedInsights;

    if (!Array.isArray(parsed.alerts) || !Array.isArray(parsed.recommendations)) {
      throw new Error('Invalid generated insights shape.');
    }

    return {
      alerts: parsed.alerts,
      recommendations: parsed.recommendations,
      generatedBy: model,
      disclaimer: 'Conteúdo gerado por IA para apoio preventivo. Não representa diagnóstico clínico.',
    };
  } catch {
    throw new BadGatewayException('Generated insights response could not be parsed.');
  }
}

function extractGeminiOutputText(responseBody: GeminiGenerateContentResponse): string {
  return responseBody.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
}

interface InsightGenerationContext {
  currentAssessment: Record<string, unknown>;
  previousAssessment: Record<string, unknown> | null;
  prediction: Record<string, unknown>;
  constraints: Record<string, unknown>;
}

interface OpenAiResponsesResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

interface OpenAiErrorResponse {
  error?: {
    message?: string;
  };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface GeminiErrorResponse {
  error?: {
    message?: string;
  };
}

interface GeneratedInsights {
  alerts: string[];
  recommendations: Array<{
    title: string;
    text: string;
  }>;
}
