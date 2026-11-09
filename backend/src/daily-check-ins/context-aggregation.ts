import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const EVOLUTION_VERSION = 'daily-window/1.experimental';
export const ORDINAL_FIELDS = ['sleep_quality', 'assessment_pressure', 'study_rest_difficulty', 'personal_support'] as const;
type DailyInput = { id: string; date: Date; updatedAt: Date; sleepHours: number; observations: Prisma.JsonValue };

export function contextKey(context: unknown): string {
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new Error('Invalid context');
  return JSON.stringify(context, Object.keys(context).sort());
}

// Experimental bridge, not a property of the trained RF/A. No missing-day imputation,
// baseline weighting, clinical thresholds or mood-to-predictor conversion.
export function aggregateContext(baseline: Prisma.JsonValue, rows: DailyInput[]) {
  contextKey(baseline);
  const context = { ...(baseline as Prisma.JsonObject) };
  const usable = rows.filter(row => row.observations && typeof row.observations === 'object' && !Array.isArray(row.observations)
    && ORDINAL_FIELDS.every(key => Number.isInteger((row.observations as Prisma.JsonObject)[key])
      && Number((row.observations as Prisma.JsonObject)[key]) >= 0 && Number((row.observations as Prisma.JsonObject)[key]) <= 4)
    && Number.isFinite(row.sleepHours) && row.sleepHours >= 0 && row.sleepHours <= 24);
  const fields = ['sleep_hours', ...ORDINAL_FIELDS];
  if (usable.length) {
    context.sleep_hours = Number((usable.reduce((sum, row) => sum + row.sleepHours, 0) / usable.length).toFixed(3));
    for (const key of ORDINAL_FIELDS) context[key] = Math.round(usable.reduce((sum, row) => sum + Number((row.observations as Prisma.JsonObject)[key]), 0) / usable.length);
  }
  const evidence = usable.map(row => ({ id: row.id, date: row.date.toISOString().slice(0, 10), revision: row.updatedAt.toISOString() }));
  const fingerprint = createHash('sha256').update(JSON.stringify({ context: contextKey(context), evidence })).digest('hex');
  return { context, fingerprint, evidence, recordedDays: usable.length, aggregatedFields: usable.length ? fields : [],
    carriedFields: Object.keys(context).filter(key => !usable.length || !fields.includes(key)),
    methods: { sleep_hours: 'arithmetic_mean_3_decimals', ordinal: 'arithmetic_mean_rounded_half_up' } };
}
