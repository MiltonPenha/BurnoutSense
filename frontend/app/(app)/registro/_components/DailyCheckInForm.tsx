"use client";
import Link from "next/link";
import { BatteryLow, Cloud, CloudRain, Frown, Smile, Waves, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { saveDailyCheckIn } from "@/lib/burnout-api";
import { moods } from "@/lib/burnout-data";
import { calculationDate, dailyDate, dailyQuestions } from "@/lib/daily-checkin";
import { formatIndex } from "@/lib/esbeu-form";
import { getError } from "@/lib/errors";
import { focusFormField } from "@/lib/form-focus";
import { validateDailyAnswers } from "@/lib/daily-form-validation";
import type { FormEvent } from "react";
import type { Assessment, DailyCheckIn, DailyObservations, DailyOverview, DailyQuestion, ObservationDraft, ObservationKey, SavedDailyCheckIn } from "@/lib/types";

const moodIcons = { happy: Smile, calm: Waves, anxious: Cloud, sad: CloudRain, angry: Zap, tired: BatteryLow, unmotivated: Frown } as const;

function Rating({ question, value, onChange, error }: { question: DailyQuestion; value: number | ""; onChange: (value: number) => void; error?: string }) {
  return <fieldset className="daily-rating" id={`daily-${question.key}`} aria-invalid={Boolean(error)} aria-describedby={error ? `daily-${question.key}-error` : undefined}><legend>{question.title}</legend><div className="daily-rating-options">{question.labels.map((label, index) => <label key={label} className={value === index ? "selected" : ""}>
    <input type="radio" name={question.key} value={index} checked={value === index} onChange={() => onChange(index)} /><span>{label}</span>
  </label>)}</div>{error && <p className="field-error" id={`daily-${question.key}-error`}>{error}</p>}</fieldset>;
}

export function DailyCheckInForm({ overview, date, existing, assessment, onSaved, onBusy, onDirty }: { overview: DailyOverview; date: string; existing: DailyCheckIn | null; assessment: Assessment; onSaved: (record: SavedDailyCheckIn) => void; onBusy: (value: boolean) => void; onDirty: () => void }) {
  const [draft, setDraft] = useState(() => ({ mood: existing?.mood ?? "", sleepHours: existing ? String(existing.sleepHours) : "", note: existing?.note ?? "",
    observations: Object.fromEntries(dailyQuestions.map(question => [question.key, existing?.observations?.[question.key] ?? ""])) as ObservationDraft }));
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const clearFieldError = (name: string) => setFieldErrors(previous => { const next = { ...previous }; delete next[name]; return next; });
  const field = (name: "mood" | "sleepHours" | "note", value: string) => { onDirty(); clearFieldError(name); setDraft(previous => ({ ...previous, [name]: value })); };
  const observation = (name: ObservationKey, value: number) => { onDirty(); clearFieldError(name); setDraft(previous => ({ ...previous, observations: { ...previous.observations, [name]: value } })); };
  function goToStep(next: number) {
    setStep(next); setError("");
    requestAnimationFrame(() => stepTitle.current?.focus());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return;
    try {
      const { errors, sleepHours } = validateDailyAnswers(draft, step === 1);
      setFieldErrors(errors);
      const first = Object.keys(errors)[0];
      if (first) {
        setError("Confira as respostas destacadas antes de continuar.");
        setStep(["mood", "sleepHours", "sleep_quality"].includes(first) ? 0 : 1);
        focusFormField(first === "sleepHours" ? "daily-sleep" : first === "mood" ? "daily-mood" : `daily-${first}`);
        return;
      }
      if (step === 0) { goToStep(1); return; }
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
          <fieldset className="daily-moods" id="daily-mood" aria-invalid={Boolean(fieldErrors.mood)} aria-describedby={fieldErrors.mood ? "daily-mood-error" : undefined}><legend>Como você se sentiu nesse dia?</legend><div>{moods.map(mood => {
            const Icon = moodIcons[mood.icon as keyof typeof moodIcons];
            return <label key={mood.name} className={draft.mood === mood.name ? "selected" : ""}>
              <input type="radio" name="mood" value={mood.name} checked={draft.mood === mood.name} onChange={() => field("mood", mood.name)} /><Icon size={22} strokeWidth={1.65} aria-hidden="true" /><span>{mood.name}</span>
            </label>;
          })}</div>{fieldErrors.mood && <p className="field-error" id="daily-mood-error">{fieldErrors.mood}</p>}</fieldset>
          <div className="daily-sleep"><label htmlFor="daily-sleep">Quantas horas você dormiu?</label><div><input id="daily-sleep" className="input" type="text" maxLength={8} inputMode="decimal" placeholder="Ex.: 7,5" value={draft.sleepHours} aria-invalid={Boolean(fieldErrors.sleepHours)} aria-describedby={`daily-sleep-hint${fieldErrors.sleepHours ? " daily-sleep-error" : ""}`} onChange={event => field("sleepHours", event.target.value)} /><span>horas</span></div><small id="daily-sleep-hint">Considere o principal período de sono associado ao dia escolhido.</small>{fieldErrors.sleepHours && <p className="field-error" id="daily-sleep-error">{fieldErrors.sleepHours}</p>}</div>
          <Rating question={dailyQuestions[0]} value={draft.observations.sleep_quality} error={fieldErrors.sleep_quality} onChange={value => observation("sleep_quality", value)} />
        </> : <>
          {dailyQuestions.slice(1).map(question => <Rating key={question.key} question={question} value={draft.observations[question.key]} error={fieldErrors[question.key]} onChange={value => observation(question.key, value)} />)}
          <div className="field"><label htmlFor="daily-note">Quer contar algo mais? <span className="daily-optional">Opcional</span></label><textarea id="daily-note" className="textarea" rows={3} maxLength={500} placeholder="Algo que marcou seu dia…" value={draft.note} onChange={event => field("note", event.target.value)} /><small className="daily-character-count">{draft.note.length}/500</small></div>
        </>}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">{step === 0 ? <Link className="button secondary" href="/dashboard">Voltar ao início</Link> : <button type="button" className="button secondary" disabled={saving} onClick={() => goToStep(0)}>Voltar</button>}<button className="button" type="submit" disabled={saving}>{saving ? "Salvando e atualizando…" : step === 0 ? "Continuar" : existing ? "Atualizar esse dia" : "Salvar meu dia"}</button></div>
    </form>
    <section className="daily-context"><div><strong>Seu índice atual: {formatIndex(assessment.estimatedOverall)}</strong><p>Calculado em {calculationDate(assessment.createdAt, overview.timeZone)}. {overview.evolution?.enabled ? "Seus check-ins podem atualizar esse resultado. Acompanhamento diário em fase de teste." : "A atualização pelos check-ins está desativada neste ambiente."}</p></div><Link className="button secondary" href="/contexto?revisao=escolher">Minha rotina mudou</Link></section>
  </>;
}
