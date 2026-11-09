"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { saveDailyCheckIn } from "@/lib/burnout-api";
import { moods } from "@/lib/burnout-data";
import { calculationDate, dailyDate, dailyQuestions } from "@/lib/daily-checkin";
import { formatIndex } from "@/lib/esbeu-form";
import { getError } from "@/lib/errors";
import type { FormEvent } from "react";
import type { Assessment, DailyCheckIn, DailyObservations, DailyOverview, DailyQuestion, ObservationDraft, ObservationKey, SavedDailyCheckIn } from "@/lib/types";

function Rating({ question, value, onChange }: { question: DailyQuestion; value: number | ""; onChange: (value: number) => void }) {
  return <fieldset className="daily-rating"><legend>{question.title}</legend><div className="daily-rating-options">{question.labels.map((label, index) => <label key={label} className={value === index ? "selected" : ""}>
    <input type="radio" name={question.key} value={index} checked={value === index} onChange={() => onChange(index)} /><span>{label}</span>
  </label>)}</div></fieldset>;
}

export function DailyCheckInForm({ overview, date, existing, assessment, onSaved, onBusy, onDirty }: { overview: DailyOverview; date: string; existing: DailyCheckIn | null; assessment: Assessment; onSaved: (record: SavedDailyCheckIn) => void; onBusy: (value: boolean) => void; onDirty: () => void }) {
  const [draft, setDraft] = useState(() => ({ mood: existing?.mood ?? "", sleepHours: existing ? String(existing.sleepHours) : "", note: existing?.note ?? "",
    observations: Object.fromEntries(dailyQuestions.map(question => [question.key, existing?.observations?.[question.key] ?? ""])) as ObservationDraft }));
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const field = (name: "mood" | "sleepHours" | "note", value: string) => { onDirty(); setDraft(previous => ({ ...previous, [name]: value })); };
  const observation = (name: ObservationKey, value: number) => { onDirty(); setDraft(previous => ({ ...previous, observations: { ...previous.observations, [name]: value } })); };
  function goToStep(next: number) {
    setStep(next); setError("");
    requestAnimationFrame(() => stepTitle.current?.focus());
  }
  function validateFirst() {
    const sleep = Number(draft.sleepHours.replace(",", "."));
    if (!draft.mood || draft.sleepHours.trim() === "" || !Number.isFinite(sleep) || sleep < 0 || sleep > 24 || draft.observations.sleep_quality === "") {
      throw new Error("Escolha seu humor e a qualidade do sono e informe entre 0 e 24 horas dormidas.");
    }
    return sleep;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return;
    try {
      const sleepHours = validateFirst();
      if (step === 0) { goToStep(1); return; }
      if (dailyQuestions.some(question => draft.observations[question.key] === "")) throw new Error("Responda sobre pressão dos estudos, descanso e apoio.");
      inFlight.current = true; setSaving(true); onBusy?.(true); setError("");
      const observations = Object.fromEntries(dailyQuestions.map(question => [question.key, Number(draft.observations[question.key])])) as DailyObservations;
      const record = await saveDailyCheckIn({ date, mood: draft.mood, sleepHours, observations, note: draft.note });
      onSaved(record);
    } catch (caught) {
      const failure = getError(caught);
      setError(failure.status === 409 ? "Revise seu acompanhamento inicial antes de registrar esse dia."
        : failure.status === 400 ? "Confira a data e as respostas do check-in."
          : failure.status ? "Não foi possível confirmar o check-in. Confira o histórico antes de tentar novamente." : failure.message);
    } finally { setSaving(false); onBusy?.(false); inFlight.current = false; }
  }

  return <>
    <ol className="daily-steps" aria-label="Etapas do check-in">
      {["Você e seu descanso", "Estudos e apoio"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} data-complete={step > index}><span aria-hidden="true">{index + 1}</span>{label}</li>)}
    </ol>
    <p className="daily-date-context">{existing ? "Já existe um registro nessa data. Ao salvar, você atualiza esse mesmo dia." : "As respostas abaixo se referem apenas ao dia escolhido."}{date < overview.windowStart ? " Esse dia ficará no histórico, fora da janela atual de acompanhamento." : ""}</p>
    <form className="daily-form" onSubmit={submit} noValidate>
      <fieldset className="card daily-fields" disabled={saving}><legend className="sr-only">Check-in de {dailyDate(date)}</legend>
        <h2 className="daily-section-title" ref={stepTitle} tabIndex={-1}>{step === 0 ? "Humor e sono" : "Pressão, descanso e apoio"}</h2>
        {step === 0 ? <>
          <fieldset className="daily-moods"><legend>Como você se sentiu nesse dia?</legend><div>{moods.map(mood => <label key={mood.name} className={draft.mood === mood.name ? "selected" : ""}>
            <input type="radio" name="mood" value={mood.name} checked={draft.mood === mood.name} onChange={() => field("mood", mood.name)} /><span className="daily-mood-emoji" aria-hidden="true">{mood.emoji}</span><span>{mood.name}</span>
          </label>)}</div></fieldset>
          <div className="daily-sleep"><label htmlFor="daily-sleep">Quantas horas você dormiu?</label><div><input id="daily-sleep" className="input" type="number" min="0" max="24" step="any" inputMode="decimal" placeholder="Ex.: 7,5" value={draft.sleepHours} onChange={event => field("sleepHours", event.target.value)} /><span>horas</span></div><small>Considere o principal período de sono associado ao dia escolhido.</small></div>
          <Rating question={dailyQuestions[0]} value={draft.observations.sleep_quality} onChange={value => observation("sleep_quality", value)} />
        </> : <>
          {dailyQuestions.slice(1).map(question => <Rating key={question.key} question={question} value={draft.observations[question.key]} onChange={value => observation(question.key, value)} />)}
          <div className="field"><label htmlFor="daily-note">Quer contar algo mais? <span className="daily-optional">Opcional</span></label><textarea id="daily-note" className="textarea" rows={3} maxLength={500} placeholder="Algo que marcou seu dia…" value={draft.note} onChange={event => field("note", event.target.value)} /><small className="daily-character-count">{draft.note.length}/500</small></div>
        </>}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">{step === 0 ? <Link className="button secondary" href="/dashboard">Voltar ao início</Link> : <button type="button" className="button secondary" disabled={saving} onClick={() => goToStep(0)}>Voltar</button>}<button className="button" type="submit" disabled={saving}>{saving ? "Salvando e atualizando…" : step === 0 ? "Continuar" : existing ? "Atualizar esse dia" : "Salvar meu dia"}</button></div>
    </form>
    <section className="daily-context"><div><strong>Seu índice atual: {formatIndex(assessment.estimatedOverall)}</strong><p>Calculado em {calculationDate(assessment.createdAt, overview.timeZone)}. {overview.evolution?.enabled ? "Seus check-ins podem atualizar esse resultado. Acompanhamento diário em fase de teste." : "A atualização pelos check-ins está desativada neste ambiente."}</p></div><Link className="button secondary" href="/contexto">Minha rotina mudou</Link></section>
  </>;
}
