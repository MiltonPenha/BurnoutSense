import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface GuidanceItem { title: string; text: string }
type FailureStatus = 'not_configured' | 'invalid_credentials' | 'rate_limited' | 'unavailable';
export type GeneratedGuidance = {
  status: 'ready'; provider: 'gemini'; generatedAt: string;
  tips: GuidanceItem[]; recommendations: GuidanceItem[];
} | { status: FailureStatus; message: string };

const unavailable = (status: FailureStatus): GeneratedGuidance => ({ status,
  message: status === 'rate_limited' ? 'As orientações estão ocupadas no momento. Tente novamente em instantes.'
    : 'Não foi possível preparar suas orientações agora. Seu acompanhamento continua salvo.' });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const promptVersion = 'student-self-care/1';

const systemInstruction = `Você escreve orientações breves de autocuidado para estudantes universitários no BurnoutSense, em português brasileiro.
Receberá somente um indicador estimado, convertido para percentual de uma escala, não uma probabilidade de doença.
Não calcule, altere ou interprete o número como diagnóstico ou classificação clínica. Não afirme que o estudante tem burnout, ansiedade ou qualquer condição.
Não deduza horas de sono, trabalho, renda, sentimentos ou outras respostas que não recebeu. Use propostas e condicionais, sem inventar fatos pessoais.
Dicas: pequenas ações práticas possíveis hoje. Recomendações: próximos passos de organização, descanso, limites e apoio ao longo dos dias.
Para percentuais mais elevados, ofereça propostas mais cuidadosas e graduais e inclua uma recomendação de buscar apoio estudantil ou profissional se o desconforto persistir.
Para percentuais menores, incentive hábitos sustentáveis sem garantir ausência de dificuldades. Nunca prescreva medicamentos nem prometa reduzir o índice.
Não gere links, HTML, markdown, emojis, estatísticas, percentuais adicionais ou cobranças por produtividade. Não repita a mesma ideia entre as listas.
Cada título deve ter até 60 caracteres e cada texto até 180 caracteres. Use uma frase curta, acolhedora e concreta por item. Responda apenas ao JSON solicitado.`;

@Injectable()
export class GuidanceService {
  // Only anonymous percentage-based content is cached, never answers or identity.
  private readonly cache = new Map<string, { expires: number; value: GeneratedGuidance }>();
  private readonly pending = new Map<string, Promise<GeneratedGuidance>>();

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async forAssessment(userId: string, assessmentId: string) {
    let record: { estimatedOverall: number } | null;
    try {
      record = await this.prisma.esbeuAssessment.findFirst({ where: { id: assessmentId, userId }, select: { estimatedOverall: true } });
    } catch {
      throw new ServiceUnavailableException('Não foi possível consultar seu acompanhamento.');
    }
    if (!record) throw new NotFoundException('Registro não encontrado.');
    const score = record.estimatedOverall;
    if (!Number.isFinite(score) || score < 0 || score > 4) return { assessmentId, ...unavailable('unavailable') };
    const percentage = Math.round(score * 250) / 10;
    const apiKey = this.config.get<string>('GEMINI_API_KEY')?.trim();
    const model = this.config.get<string>('GEMINI_MODEL') ?? 'gemini-3.1-flash-lite';
    if (this.config.get<string>('GEMINI_GUIDANCE_ENABLED') === 'false' || !apiKey) {
      return { assessmentId, ...unavailable('not_configured') };
    }
    if (!/^gemini-[a-z0-9.-]{1,80}$/.test(model)) return { assessmentId, ...unavailable('not_configured') };
    const key = `${promptVersion}:${model}:${percentage}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return { assessmentId, basedOnPercentage: percentage, ...cached.value };
    let task = this.pending.get(key);
    if (!task) {
      if (this.pending.size >= 2) return { assessmentId, ...unavailable('rate_limited') };
      task = this.generate(apiKey, model, percentage).then(value => {
        if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { value, expires: Date.now() + (value.status === 'ready' ? 86_400_000 : 60_000) });
        return value;
      }).finally(() => this.pending.delete(key));
      this.pending.set(key, task);
    }
    return { assessmentId, basedOnPercentage: percentage, ...await task };
  }

  private async generate(apiKey: string, model: string, percentage: number): Promise<GeneratedGuidance> {
    const count = Math.round(percentage) >= 66 ? 3 : 2;
    const item = { type: 'object', properties: { title: { type: 'string', maxLength: 60 }, text: { type: 'string', maxLength: 180 } }, required: ['title', 'text'], additionalProperties: false };
    const list = { type: 'array', minItems: count, maxItems: count, items: item };
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify({ indicatorPercentage: percentage, itemsPerList: count }) }] }],
          generationConfig: { maxOutputTokens: 1800, responseMimeType: 'application/json',
            responseJsonSchema: { type: 'object', properties: { tips: list, recommendations: list }, required: ['tips', 'recommendations'], additionalProperties: false } },
        }),
      });
      // Provider errors can contain credentials or request details: never relay them.
      if (!response.ok) return unavailable([400, 401, 403].includes(response.status) ? 'invalid_credentials' : response.status === 429 ? 'rate_limited' : 'unavailable');
      const body: unknown = await response.json();
      if (!object(body) || !Array.isArray(body.candidates)) return unavailable('unavailable');
      const candidate: unknown = body.candidates[0];
      if (!object(candidate) || candidate.finishReason !== 'STOP' || !object(candidate.content) || !Array.isArray(candidate.content.parts)) return unavailable('unavailable');
      const text = candidate.content.parts.filter((part: unknown) => object(part) && !part.thought && typeof part.text === 'string').map((part: Record<string, unknown>) => part.text).join('');
      if (text.length > 10_000) return unavailable('unavailable');
      const parsed: unknown = JSON.parse(text);
      if (!object(parsed)) return unavailable('unavailable');
      const tips = this.items(parsed.tips, count), recommendations = this.items(parsed.recommendations, count);
      if (!tips || !recommendations || new Set([...tips, ...recommendations].map(item => item.text.toLocaleLowerCase('pt-BR'))).size !== count * 2) return unavailable('unavailable');
      return { status: 'ready', provider: 'gemini', generatedAt: new Date().toISOString(), tips, recommendations };
    } catch {
      return unavailable('unavailable');
    }
  }

  private items(value: unknown, count: number): GuidanceItem[] | null {
    if (!Array.isArray(value) || value.length !== count) return null;
    const result: GuidanceItem[] = [];
    for (const item of value) {
      if (!object(item) || typeof item.title !== 'string' || typeof item.text !== 'string') return null;
      const title = item.title.trim(), text = item.text.trim();
      if (title.length < 3 || title.length > 60 || text.length < 10 || text.length > 180
        || /[<>]|https?:\/\/|\b(?:medicamentos?|antidepressivos?|ansiolíticos?)\b/i.test(`${title} ${text}`)) return null;
      result.push({ title, text });
    }
    return result;
  }
}
