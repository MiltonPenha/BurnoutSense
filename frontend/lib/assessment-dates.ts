import type { Assessment, CheckInOrigin } from "./types";

export function checkInOrigin(record: Assessment): CheckInOrigin | null {
  if (record.source !== "daily_experimental" || !record.triggerCheckIn) return null;
  const metadata = record.evolution;
  return metadata && "trigger" in metadata && metadata.trigger?.id === record.triggerCheckIn.id
    ? metadata.trigger : record.triggerCheckIn;
}

export function registrationDate(value: string, timeZone = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone }).format(new Date(value));
}
