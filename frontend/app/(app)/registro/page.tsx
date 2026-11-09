"use client";
import "./registro.css";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCurrentContext, getDailyDay, getDailyOverview, recalculateDailyIndex } from "@/lib/burnout-api";
import { CHECK_IN_FEEDBACK_KEY, dailyDate, indexUpdateMessage, isCalendarDay, shiftCalendarDay } from "@/lib/daily-checkin";
import { DailyCheckInForm } from "./_components/DailyCheckInForm";
import { CheckInCalendar } from "./_components/CheckInCalendar";
import type { CurrentContext, DailyDay, DailyOverview, SavedDailyCheckIn } from "@/lib/types";

function RegistroContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [current, setCurrent] = useState<CurrentContext | null>(null);
  const [overview, setOverview] = useState<DailyOverview | null>(null);
  const [date, setDate] = useState("");
  const [day, setDay] = useState<DailyDay | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pendingDate, setPendingDate] = useState("");
  const [dayAttempt, setDayAttempt] = useState(0);
  const discardDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    Promise.all([getCurrentContext(), getDailyOverview()]).then(([context, daily]) => {
      if (!active) return;
      if (!context.assessment) { router.replace("/contexto"); return; }
      setCurrent(context); setOverview(daily);
      const requested = params.get("date");
      setDate(requested && isCalendarDay(requested) && requested <= daily.today ? requested : daily.today);
    }).catch(() => { if (active) setError("Não foi possível carregar seu acompanhamento. Tente novamente."); });
    return () => { active = false; };
  }, [router, params]);
  useEffect(() => {
    if (!date) return;
    let active = true;
    getDailyDay(date).then(value => { if (active) setDay(value); })
      .catch(() => { if (active) setError("Não foi possível carregar a data escolhida."); });
    return () => { active = false; };
  }, [date, dayAttempt]);
  function openDay(nextDate: string) {
    setDay(null); setError(""); setNotice(""); setDirty(false); setDate(nextDate);
  }
  function selectDate(nextDate: string) {
    if (!overview || !isCalendarDay(nextDate) || nextDate > overview.today || nextDate === date) return;
    if (!dirty) { openDay(nextDate); return; }
    setPendingDate(nextDate);
    discardDialog.current?.showModal();
  }
  async function refresh() {
    const [context, daily] = await Promise.all([getCurrentContext(), getDailyOverview()]);
    setCurrent(context); setOverview(daily);
    window.dispatchEvent(new Event("burnoutsense-checkin-change"));
    window.dispatchEvent(new Event("burnoutsense-esbeu-change"));
  }
  function onSaved(record: SavedDailyCheckIn) {
    const message = overview && record.date.slice(0, 10) < overview.windowStart && record.indexUpdate.status === "unchanged"
      ? "Dia adicionado ao histórico, fora da janela de cálculo atual." : indexUpdateMessage(record.indexUpdate);
    try { sessionStorage.setItem(CHECK_IN_FEEDBACK_KEY, message); } catch { /* Navigation does not depend on browser storage. */ }
    window.dispatchEvent(new Event("burnoutsense-checkin-change"));
    window.dispatchEvent(new Event("burnoutsense-esbeu-change"));
    router.replace("/dashboard");
  }
  async function retry() {
    setRetrying(true);
    try { const result = await recalculateDailyIndex(); setNotice(indexUpdateMessage(result)); await refresh(); }
    catch { setNotice("Não foi possível atualizar o índice agora. Seus registros continuam salvos."); }
    finally { setRetrying(false); }
  }
  return <section className="page daily-page">
    <header className="page-header"><div><p className="overline">Um dia de cada vez</p><h1 className="page-title">Como foi seu dia?</h1><p className="page-kicker">Registre seu momento e acompanhe as mudanças na sua rotina.</p></div></header>
    {overview && <div className="daily-date-row">
      <CheckInCalendar date={date} today={overview.today} disabled={saving || retrying} onSelect={selectDate} />
      <div className="daily-date-shortcuts" role="group" aria-label="Datas rápidas">
        <button type="button" aria-pressed={date === overview.today} disabled={saving || retrying} onClick={() => selectDate(overview.today)}>Hoje</button>
        <button type="button" aria-pressed={date === shiftCalendarDay(overview.today, -1)} disabled={saving || retrying} onClick={() => selectDate(shiftCalendarDay(overview.today, -1))}>Ontem</button>
      </div>
    </div>}
    {error && <div role="alert" className="daily-load-error"><p>{error}</p><button className="button secondary" type="button" onClick={() => { if (day || !overview) window.location.reload(); else { setError(""); setDayAttempt(value => value + 1); } }}>Tentar novamente</button></div>}
    {current?.assessment && overview && day && day.date === date
      ? <DailyCheckInForm key={date} overview={overview} date={date} existing={day.checkIn} assessment={current.assessment} onSaved={onSaved} onBusy={setSaving} onDirty={() => setDirty(true)} />
      : !error && <p role="status">Preparando seu acompanhamento…</p>}
    {notice && <p className="daily-update-notice" role="status">{notice}</p>}
    {overview?.evolution?.pending && <section className="daily-pending"><p>Há mudanças nos seus registros que ainda não entraram no índice atual.</p><button className="button secondary" type="button" disabled={retrying || saving} onClick={retry}>{retrying ? "Atualizando…" : "Tentar atualizar índice"}</button></section>}
    <dialog ref={discardDialog} className="daily-date-dialog" aria-labelledby="discard-date-title">
      <h2 id="discard-date-title">Trocar o dia do check-in?</h2>
      <p>As respostas não salvas serão descartadas ao abrir {dailyDate(pendingDate)}.</p>
      <div className="form-actions"><button type="button" className="button secondary" onClick={() => discardDialog.current?.close()}>Continuar preenchendo</button><button type="button" className="button" onClick={() => { discardDialog.current?.close(); openDay(pendingDate); }}>Trocar dia</button></div>
    </dialog>
  </section>;
}

export default function RegistroPage() {
  return <Suspense fallback={<p role="status">Preparando seu acompanhamento…</p>}><RegistroContent /></Suspense>;
}
