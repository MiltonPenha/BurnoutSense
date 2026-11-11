import type { DailyCheckIn, ObservationKey } from "./types";
import { isCalendarDay, shiftCalendarDay } from "./daily-checkin.ts";

const signals = {
  sleep_quality: { better: "Melhor qualidade do sono", worse: "Pior qualidade do sono", sign: 1 },
  assessment_pressure: { better: "Menos pressão de provas e prazos", worse: "Mais pressão de provas e prazos", sign: -1 },
  study_rest_difficulty: { better: "Mais facilidade para conciliar estudos e descanso", worse: "Mais dificuldade para conciliar estudos e descanso", sign: -1 },
  personal_support: { better: "Mais apoio de pessoas próximas", worse: "Menos apoio de pessoas próximas", sign: 1 },
} as const;
const keys = Object.keys(signals) as ObservationKey[];
const median = (values: number[]) => values.sort((a, b) => a - b)[1];

export function routineTrend(rows: DailyCheckIn[], today: string) {
  const newest = new Map<string, DailyCheckIn>();
  for (const row of rows) {
    const day = row.date.slice(0, 10);
    if (!isCalendarDay(day) || day > today || day < shiftCalendarDay(today, -13)) continue;
    if (!row.observations || !keys.every((key) => {
      const value = row.observations?.[key];
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
    }) || !Number.isFinite(row.sleepHours) || row.sleepHours < 0 || row.sleepHours > 24) continue;
    if (!newest.has(day) || newest.get(day)!.updatedAt < row.updatedAt) newest.set(day, row);
  }
  const recent = [...newest].sort(([a], [b]) => b.localeCompare(a)).slice(0, 6);
  if (recent.length < 6 || recent[2][0] < shiftCalendarDay(today, -6)) return null;
  const current = recent.slice(0, 3).map(([, row]) => row);
  const previous = recent.slice(3).map(([, row]) => row);
  const changes = keys.flatMap((key) => {
    const delta = signals[key].sign * (median(current.map((row) => row.observations![key])) -
      median(previous.map((row) => row.observations![key])));
    return delta ? [{ key, delta, label: delta > 0 ? signals[key].better : signals[key].worse }] : [];
  });
  const sleepDelta = median(current.map((row) => row.sleepHours)) - median(previous.map((row) => row.sleepHours));
  const better = changes.some(({ delta }) => delta > 0);
  const worse = changes.some(({ delta }) => delta < 0);
  const direction = better === worse ? null : better ? "better" : "worse";
  const strong = Boolean(direction && (changes.length >= 2 || changes.some(({ delta }) => Math.abs(delta) >= 2)));
  return { changes, sleepDelta, direction, strong, latestDay: recent[0][0] } as const;
}

export type RoutineTrend = NonNullable<ReturnType<typeof routineTrend>>;
