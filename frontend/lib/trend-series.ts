import type { TrendRecord } from "./types";
import { shiftCalendarDay } from "./daily-checkin.ts";

export type TrendMode = "daily" | "weekly" | "monthly";
export interface TrendPoint {
  start: string; end: string; value: number; days: number; label: string;
  connectPrevious: boolean;
}
export function calculationDay(value: string, timeZone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
function startOf(day: string, mode: TrendMode) {
  if (mode === "daily") return day;
  if (mode === "monthly") return day.slice(0, 7) + "-01";
  const weekday = new Date(day + "T00:00:00Z").getUTCDay();
  return shiftCalendarDay(day, -((weekday + 6) % 7));
}
function following(start: string, mode: TrendMode) {
  if (mode !== "monthly") return shiftCalendarDay(start, mode === "daily" ? 1 : 7);
  const date = new Date(start + "T00:00:00Z"); date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}
export function trendSeries(records: TrendRecord[], mode: TrendMode, timeZone = "America/Sao_Paulo"): TrendPoint[] {
  const daily = new Map<string, TrendRecord>();
  for (const row of records) {
    if (!Number.isFinite(Date.parse(row.createdAt)) || !Number.isFinite(row.estimatedOverall) || row.estimatedOverall < 0 || row.estimatedOverall > 4) continue;
    const day = calculationDay(row.createdAt, timeZone), previous = daily.get(day);
    if (!previous || Date.parse(row.createdAt) > Date.parse(previous.createdAt) ||
      Date.parse(row.createdAt) === Date.parse(previous.createdAt) && row.id > previous.id) daily.set(day, row);
  }
  const groups = new Map<string, TrendRecord[]>();
  for (const [day, row] of [...daily].sort(([a], [b]) => a.localeCompare(b))) {
    const start = startOf(day, mode);
    groups.set(start, [...(groups.get(start) ?? []), row]);
  }
  return [...groups].map(([start, items], i, entries) => {
    const end = shiftCalendarDay(following(start, mode), -1);
    return { start, end, days: items.length, value: items.reduce((sum, r) => sum + r.estimatedOverall, 0) / items.length,
      label: mode === "monthly" ? `${start.slice(5, 7)}/${start.slice(0, 4)}` : mode === "daily" ? shortDate(start) : `${shortDate(start)}–${shortDate(end)}`,
      connectPrevious: i > 0 && following(entries[i - 1][0], mode) === start };
  });
}
