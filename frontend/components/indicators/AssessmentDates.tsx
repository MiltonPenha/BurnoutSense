import { checkInOrigin, registrationDate } from "@/lib/assessment-dates";
import { dailyDate } from "@/lib/daily-checkin";
import type { Assessment } from "@/lib/types";

export function AssessmentDates({ record }: { record: Assessment }) {
  const origin = checkInOrigin(record);
  const reason = record.evolution && "reason" in record.evolution ? record.evolution.reason : null;
  if (!origin) return <div className="assessment-dates"><span>Registrado em <time dateTime={record.createdAt}>{registrationDate(record.createdAt)}</time></span>
    {record.source === "daily_experimental" && (reason === "check_in_deleted" || reason === "window_refresh") && <small>{reason === "check_in_deleted" ? "Recalculado após exclusão de check-in" : "Atualização do acompanhamento"}</small>}</div>;
  const updatedAt = record.triggerCheckIn?.updatedAt ?? origin.updatedAt;
  const updated = updatedAt !== origin.createdAt;
  return <div className="assessment-dates">
    <strong>Dia do check-in: <time dateTime={origin.date.slice(0, 10)}>{dailyDate(origin.date)}</time></strong>
    <span>Registrado em <time dateTime={origin.createdAt}>{registrationDate(origin.createdAt)}</time></span>
    {updated && <span>Check-in atualizado em <time dateTime={updatedAt}>{registrationDate(updatedAt)}</time></span>}
    {registrationDate(origin.createdAt) !== registrationDate(record.createdAt) && <small>Índice calculado em <time dateTime={record.createdAt}>{registrationDate(record.createdAt)}</time></small>}
  </div>;
}
