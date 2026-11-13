"use client";
import "./DailyHistory.css";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { deleteDailyCheckIn, getDailyPage } from "@/lib/burnout-api";
import { dailyDate, dailyQuestions, demandLabels, energyLabels } from "@/lib/daily-checkin";
import { registrationDate } from "@/lib/assessment-dates";
import { trapDialogFocus } from "@/components/ui/AccessibleDialog";
import { CheckInMoodIcon } from "@/components/indicators/CheckInMoodIcon";
import type { DailyCheckIn } from "@/lib/types";

const hours = new Intl.NumberFormat("pt-BR");
const observationLabels = {
  sleep_quality: "Qualidade do sono",
  assessment_pressure: "Pressão dos estudos",
  study_rest_difficulty: "Conciliação com descanso",
  personal_support: "Apoio"
};

export function DailyHistory() {
  const [records, setRecords] = useState<DailyCheckIn[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<DailyCheckIn | null>(null);
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  useEffect(() => { let active = true;
    getDailyPage().then((value) => { if (active) { setRecords(value.items); setCursor(value.nextCursor); } }).catch(() => { if (active) setError("Não foi possível carregar seus check-ins."); });
    return () => { active = false; };
  }, []);
  async function more() {
    if (inFlight.current || !cursor) return;
    inFlight.current = true; setBusy(true); setError("");
    try { const page = await getDailyPage(cursor); setRecords((previous) => [...new Map([...(previous ?? []), ...page.items].map((item) => [item.id, item])).values()]); setCursor(page.nextCursor); }
    catch { setError("Não foi possível carregar mais registros."); } finally { setBusy(false); inFlight.current = false; }
  }
  async function remove() {
    if (inFlight.current || !selected) return;
    inFlight.current = true; setBusy(true); setError("");
    try { const result = await deleteDailyCheckIn(selected.id); setRecords((previous) => (previous ?? []).filter((item) => item.id !== selected.id)); dialog.current?.close(); setSelected(null); setNotice(result?.indexUpdate?.status === "updated" ? "Check-in excluído e índice atualizado." : result?.indexUpdate?.status === "unchanged" ? "Check-in excluído. O contexto do cálculo permanece igual." : "Check-in excluído. Consulte o painel para acompanhar a atualização do índice."); window.dispatchEvent(new Event("burnoutsense-checkin-change")); window.dispatchEvent(new Event("burnoutsense-esbeu-change")); }
    catch { setError("Não foi possível excluir este check-in."); } finally { setBusy(false); inFlight.current = false; }
  }
  return <div className="daily-history">
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {records === null && !error && <p role="status">Carregando seus dias…</p>}
    {records?.length === 0 && <div className="card"><h2>Seu primeiro check-in está esperando por você</h2><p>Depois do acompanhamento inicial, registre seu dia em poucas respostas.</p><Link className="button" href="/registro">Registrar meu dia</Link></div>}
    {records?.length ? <div className="card daily-history-list">
      {records.map(record => {
        const created = registrationDate(record.createdAt);
        const updated = registrationDate(record.updatedAt);
        return (
          <article className="daily-history-item" key={record.id}>
            <header>
              <div>
                <h2><time dateTime={record.date.slice(0, 10)}>{dailyDate(record.date)}</time></h2>
                <div className="daily-history-dates">
                  <span>Registrado em <time dateTime={record.createdAt}>{created}</time></span>
                  {updated !== created && <span>Atualizado em <time dateTime={record.updatedAt}>{updated}</time></span>}
                </div>
              </div>
              <div className="daily-history-actions">
                <Link className="daily-history-edit" href={`/registro?date=${record.date.slice(0, 10)}`}><Pencil size={16} aria-hidden="true" />Editar dia</Link>
                <button aria-label={`Excluir check-in de ${dailyDate(record.date)}`} type="button" onClick={() => { setSelected(record); dialog.current?.showModal(); }}><Trash2 size={16} aria-hidden="true" />Excluir</button>
              </div>
            </header>
            <dl>
              <div><dt>Humor</dt><dd className="daily-history-mood"><CheckInMoodIcon mood={record.mood} size={18} />{record.mood}</dd></div>
              <div><dt>Horas de sono</dt><dd>{hours.format(record.sleepHours)} h</dd></div>
              {record.observations ? dailyQuestions.map(question => (
                <div key={question.key}>
                  <dt>{observationLabels[question.key]}</dt>
                  <dd>{question.labels[record.observations?.[question.key] ?? -1] ?? "Não informado"}</dd>
                </div>
              )) : <>
                <div><dt>Energia</dt><dd>{energyLabels[record.energy ?? -1] ?? "Não informada"}</dd></div>
                <div><dt>Demandas</dt><dd>{demandLabels[record.academicDemand ?? -1] ?? "Não informadas"}</dd></div>
              </>}
            </dl>
            {record.note && <p className="daily-history-note">{record.note}</p>}
          </article>
        );
      })}
    </div> : null}
    {cursor && <button className="button secondary" type="button" disabled={busy} onClick={more}>{busy ? "Carregando…" : "Carregar mais dias"}</button>}
    <dialog ref={dialog} className="daily-delete-dialog" onKeyDown={trapDialogFocus} onCancel={(event) => { if (busy) event.preventDefault(); else setSelected(null); }} aria-labelledby="daily-delete-title"><h2 id="daily-delete-title">Excluir este check-in?</h2><p>O registro de {selected ? dailyDate(selected.date) : ""} e os índices diretamente vinculados a ele serão removidos. O acompanhamento será recalculado com os dias restantes.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => { dialog.current?.close(); setSelected(null); }}>Cancelar</button><button type="button" className="button danger" disabled={busy} onClick={remove}>{busy ? "Excluindo…" : "Confirmar exclusão"}</button></div></dialog>
  </div>;
}
