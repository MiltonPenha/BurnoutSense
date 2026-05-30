"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { emojiForMood, moods } from "@/lib/burnout-data";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";

const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function todayIso() {
  return toIsoDate(new Date());
}

function recordToForm(record) {
  return {
    date: record.date,
    sleepHours: record.sleepHours ?? 0,
    studyHours: record.studyHours ?? 0,
    screenTime: record.screenTime ?? 0,
    academicPerformance: record.academicPerformance ?? 5,
    examPressure: record.examPressure ?? 5,
    sleepQuality: record.sleepQuality ?? 5,
    stress: record.stress ?? 5,
    tiredness: record.tiredness ?? 5,
    physicalActivity: record.physicalActivity ?? 5,
    socialSupport: record.socialSupport ?? 5,
    financialStress: record.financialStress ?? 5,
    mood: record.mood ?? "Calmo",
    notes: record.notes ?? ""
  };
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateLabel(value) {
  return new Intl.DateTimeFormat("pt-BR").format(parseIsoDate(value));
}

function formatMonthLabel(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric"
  }).format(date);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(viewDate) {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function DatePicker({ value, onChange }) {
  const maxDateIso = todayIso();
  const selectedDate = parseIsoDate(value);
  const maxDate = parseIsoDate(maxDateIso);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const days = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const isViewingCurrentMonth = viewDate.getFullYear() === maxDate.getFullYear() && viewDate.getMonth() === maxDate.getMonth();

  function toggleCalendar() {
    if (!open) {
      const nextSelectedDate = parseIsoDate(value);
      setViewDate(new Date(nextSelectedDate.getFullYear(), nextSelectedDate.getMonth(), 1));
    }

    setOpen((current) => !current);
  }

  function selectDate(date) {
    const isoDate = toIsoDate(date);

    if (isoDate > maxDateIso) {
      return;
    }

    onChange(isoDate);
    setOpen(false);
  }

  function selectToday() {
    const today = new Date();
    onChange(toIsoDate(today));
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setOpen(false);
  }

  return (
    <div className="date-picker">
      <button className="date-trigger" type="button" onClick={toggleCalendar}>
        <span>{formatDateLabel(value)}</span>
        <span className="calendar-trigger-icon" aria-hidden="true" />
      </button>

      {open ? (
        <div className="calendar-popover" role="dialog" aria-label="Selecionar data do registro">
          <div className="calendar-head">
            <button aria-label="Mês anterior" className="calendar-nav" type="button" onClick={() => setViewDate((current) => addMonths(current, -1))}>
              ‹
            </button>
            <strong>{formatMonthLabel(viewDate)}</strong>
            <button aria-label="Próximo mês" className="calendar-nav" type="button" disabled={isViewingCurrentMonth} onClick={() => setViewDate((current) => addMonths(current, 1))}>
              ›
            </button>
          </div>

          <div className="calendar-weekdays">
            {weekDays.map((day) => <span key={day}>{day}</span>)}
          </div>

          <div className="calendar-grid">
            {days.map((date) => {
              const isoDate = toIsoDate(date);
              const outsideMonth = date.getMonth() !== viewDate.getMonth();
              const selected = isoDate === value;
              const today = isoDate === maxDateIso;
              const future = isoDate > maxDateIso;

              return (
                <button
                  aria-disabled={future}
                  className={`calendar-day ${outsideMonth ? "outside" : ""} ${selected ? "selected" : ""} ${today ? "today" : ""} ${future ? "disabled" : ""}`}
                  disabled={future}
                  key={isoDate}
                  type="button"
                  onClick={() => selectDate(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="calendar-actions">
            <button className="calendar-today" type="button" onClick={selectToday}>Hoje</button>
            <button className="calendar-close" type="button" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RangeField({ field, label, value, onChange, min = 0, max = 10, helperText, className = "" }) {
  const numericValue = Number(value);
  const percentage = Math.min(100, Math.max(0, ((numericValue - min) / (max - min)) * 100));

  return (
    <div className={`range-row ${className}`.trim()}>
      <div className="range-head">
        <label htmlFor={field}>{label}</label>
        <span className="range-value">{numericValue}/{max}</span>
      </div>
      {helperText ? <p className="range-helper">{helperText}</p> : null}
      <input
        className="range"
        id={field}
        min={min}
        max={max}
        style={{ "--range-progress": `${percentage}%` }}
        type="range"
        value={value}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </div>
  );
}

function previewTone(form) {
  const stress = Number(form.stress);
  const tiredness = Number(form.tiredness);
  const sleepQuality = Number(form.sleepQuality);

  if (stress >= 8 || tiredness >= 8 || sleepQuality <= 4) {
    return {
      label: "Sinais mais intensos",
      tone: "danger",
      text: "Esta prévia usa apenas os campos preenchidos neste formulário. Ao salvar, o painel calcula a análise completa."
    };
  }

  if (stress >= 6 || tiredness >= 6 || sleepQuality <= 6) {
    return {
      label: "Alguns pontos de atenção",
      tone: "warning",
      text: "Esta prévia muda conforme você ajusta sono, estresse, cansaço e contexto do dia."
    };
  }

  return {
    label: "Campos em faixa estável",
    tone: "success",
    text: "Esta leitura é temporária e serve só para orientar o preenchimento do registro atual."
  };
}

function previewSleepLabel(hours) {
  const value = Number(hours);

  if (value >= 7) {
    return "Sono preservado";
  }

  if (value >= 5) {
    return "Sono curto";
  }

  return "Sono em alerta";
}

function previewStressLabel(stress) {
  const value = Number(stress);

  if (value >= 8) {
    return "Estresse alto";
  }

  if (value >= 5) {
    return "Estresse moderado";
  }

  if (value >= 2) {
    return "Estresse baixo";
  }

  return "Estresse muito baixo";
}

export default function RegistroPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const editing = Boolean(editId);
  const { addRecord, findRecord, ready, updateRecord } = useBurnoutStore();
  const [form, setForm] = useState({
    date: todayIso(),
    sleepHours: 0,
    studyHours: 0,
    screenTime: 0,
    academicPerformance: 5,
    examPressure: 5,
    sleepQuality: 5,
    stress: 5,
    tiredness: 5,
    physicalActivity: 5,
    socialSupport: 5,
    financialStress: 5,
    mood: "Calmo",
    notes: ""
  });
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const moodOptions = useMemo(() => moods, []);
  const preview = previewTone(form);
  const sleepLabel = previewSleepLabel(form.sleepHours);
  const stressLabel = previewStressLabel(form.stress);
  const selectedMoodEmoji = emojiForMood(form.mood);

  useEffect(() => {
    let active = true;

    async function loadRecordForEdit() {
      if (!editId || !ready) {
        return;
      }

      const record = await findRecord(editId);

      if (!active) {
        return;
      }

      if (!record) {
        setLoadError("Não foi possível carregar o registro para edição.");
        return;
      }

      setForm(recordToForm(record));
      setLoadError("");
    }

    loadRecordForEdit();

    return () => {
      active = false;
    };
  }, [editId, findRecord, ready]);

  useEffect(() => {
    if (!submitError) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setSubmitError(""), 7000);
    return () => window.clearTimeout(timeoutId);
  }, [submitError]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError("");
    setSubmitting(true);

    const academicPerformance = Number(form.academicPerformance);
    const examPressure = Number(form.examPressure);

    const recordPayload = {
      ...form,
      id: editId ?? `record-${form.date}-${Date.now()}`,
      sleepHours: Number(form.sleepHours),
      studyHours: Number(form.studyHours),
      screenTime: Number(form.screenTime),
      academicPerformance,
      examPressure,
      workHours: 0,
      pendingTasks: Math.max(0, 10 - academicPerformance),
      importantDelivery: examPressure >= 7,
      sleepQuality: Number(form.sleepQuality),
      stress: Number(form.stress),
      tiredness: Number(form.tiredness),
      physicalActivity: Number(form.physicalActivity),
      socialSupport: Number(form.socialSupport),
      financialStress: Number(form.financialStress)
    };

    const validationMessage = validateRecordPayload(recordPayload);

    if (validationMessage) {
      setSubmitError(validationMessage);
      setSubmitting(false);
      return;
    }

    try {
      if (editing) {
        await updateRecord(editId, recordPayload);
        window.sessionStorage.setItem("burnoutsense.recordSaved", "updated");
        router.push("/historico");
      } else {
        const savedRecord = await addRecord(recordPayload);
        window.sessionStorage.setItem("burnoutsense.recordSaved", "created");
        router.push(`/historico/${savedRecord.id}`);
      }
    } catch (error) {
      setSubmitError(formatSubmitError(error));
      setSubmitting(false);
    }
  }

  return (
    <section className="page record-page">
      <header className="record-hero">
        <div className="record-hero-copy">
          <p className="overline">Novo registro</p>
          <h1 className="page-title">{editing ? "Revisar registro" : "Registrar meu dia"}</h1>
          <p className="page-kicker">
            {editing ? "Ajuste as informações do dia para recalcular sua análise preventiva." : "Preencha os campos com calma. A prévia ao lado usa apenas este formulário e a análise completa aparece depois de salvar."}
          </p>
          <div className="record-hero-pills" aria-label="Resumo do registro">
            <span>🧭 Rotina</span>
            <span>🌙 Sono</span>
            <span>🫧 Bem-estar</span>
          </div>
        </div>

        <aside className={`record-preview-card tone-${preview.tone}`} aria-label="Prévia deste registro">
          <span className="record-preview-icon emoji-icon" aria-hidden="true">{preview.tone === "success" ? "🌿" : preview.tone === "warning" ? "🌤️" : "💗"}</span>
          <div>
            <p className="overline">Prévia deste registro</p>
            <strong>{preview.label}</strong>
            <span>{preview.text}</span>
          </div>
        </aside>
      </header>

      {loadError ? <p className="form-error">{loadError}</p> : null}
      {submitError ? (
        <div className="toast toast-error" role="alert" style={{ "--toast-duration": "7s" }}>
          <strong>Não foi possível salvar</strong>
          <span>{submitError}</span>
        </div>
      ) : null}

      <form className="record-form" onSubmit={handleSubmit}>
        <section className="record-status-grid" aria-label="Indicadores principais">
          <article className="record-status-card">
            <span className="record-status-icon emoji-icon" aria-hidden="true">🌙</span>
            <div>
              <strong>{form.sleepHours}h</strong>
              <span>{sleepLabel}</span>
            </div>
          </article>
          <article className="record-status-card">
            <span className="record-status-icon emoji-icon" aria-hidden="true">⚡</span>
            <div>
              <strong>{form.stress}/10</strong>
              <span>{stressLabel}</span>
            </div>
          </article>
          <article className="record-status-card">
            <span className="record-status-icon emoji-icon" aria-hidden="true">{selectedMoodEmoji}</span>
            <div>
              <strong>{form.mood}</strong>
              <span>Humor predominante</span>
            </div>
          </article>
        </section>

        <section className="card form-card record-form-card record-section-academic">
          <div className="record-section-head">
            <span className="record-section-icon emoji-icon" aria-hidden="true">📚</span>
            <div>
              <p className="overline">Bloco 1</p>
              <h2 className="section-title">Rotina acadêmica</h2>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="date">Data do registro</label>
              <DatePicker value={form.date} onChange={(value) => updateField("date", value)} />
            </div>
            <div className="field">
              <label htmlFor="sleepHours">Horas de sono</label>
              <input className="input" id="sleepHours" min="0" max="18" required step="0.5" type="number" value={form.sleepHours} onChange={(event) => updateField("sleepHours", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="studyHours">Horas de estudo</label>
              <input className="input" id="studyHours" min="0" max="18" required step="0.5" type="number" value={form.studyHours} onChange={(event) => updateField("studyHours", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="screenTime">Tempo de tela</label>
              <input className="input" id="screenTime" min="0" max="24" required step="0.5" type="number" value={form.screenTime} onChange={(event) => updateField("screenTime", event.target.value)} />
            </div>
          </div>

          {[
            ["academicPerformance", "Desempenho acadêmico percebido"],
            ["examPressure", "Pressão acadêmica"]
          ].map(([field, label]) => <RangeField field={field} key={field} label={label} value={form[field]} onChange={updateField} />)}
        </section>

        <section className="card form-card record-form-card record-section-wellbeing">
          <div className="record-section-head">
            <span className="record-section-icon emoji-icon" aria-hidden="true">🫧</span>
            <div>
              <p className="overline">Bloco 2</p>
              <h2 className="section-title">Bem-estar e contexto</h2>
            </div>
          </div>

          {[
            ["sleepQuality", "Qualidade do sono"],
            ["stress", "Nível de estresse"],
            ["tiredness", "Nível de cansaço"],
            ["physicalActivity", "Atividade física"],
            ["socialSupport", "Suporte social"],
            ["financialStress", "Estresse financeiro"]
          ].map(([field, label]) => <RangeField field={field} key={field} label={label} value={form[field]} onChange={updateField} />)}

          <div className="field">
            <span className="field-label">Humor predominante</span>
            <div className="mood-grid record-mood-grid">
              {moodOptions.map((mood) => (
                <button
                  className={`mood-option ${form.mood === mood.name ? "active" : ""}`}
                  key={mood.name}
                  type="button"
                  onClick={() => updateField("mood", mood.name)}
                >
                  <span className="mood-emoji emoji-icon" aria-hidden="true">{mood.emoji}</span>
                  <span className="mood-name">{mood.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="notes">Descreva como foi seu dia</label>
            <p className="field-hint">Pode ser curto. Uma frase sincera já ajuda a dar contexto aos números.</p>
            <textarea
              className="textarea"
              id="notes"
              placeholder="Compartilhe sentimentos, dificuldades e situações que afetaram sua rotina..."
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
            />
          </div>
        </section>

        <div className="form-actions">
          <button className="button secondary" type="button" disabled={submitting} onClick={() => router.push(editing ? "/historico" : "/dashboard")}>Cancelar</button>
          <button className="button" type="submit" disabled={submitting}>{submitting ? "Salvando..." : editing ? "Salvar edição" : "Gerar análise"}</button>
        </div>
      </form>
    </section>
  );
}

function formatSubmitError(error) {
  const message = error?.message ?? "";

  if (error?.status === 503 || message.toLowerCase().includes("ai service")) {
    return "Serviço de IA indisponível no momento. Tente novamente mais tarde.";
  }

  if (message && !message.toLowerCase().startsWith("request failed")) {
    return message;
  }

  return "Não foi possível salvar o registro. Confira os campos e tente novamente.";
}

function validateRecordPayload(record) {
  if (!record.date) {
    return "Informe a data do registro.";
  }

  if (record.date > todayIso()) {
    return "A data do registro não pode ser futura. Escolha hoje ou um dia anterior.";
  }

  const hourFields = [
    ["sleepHours", "horas de sono"],
    ["studyHours", "horas de estudo"],
    ["screenTime", "tempo de tela"]
  ];

  for (const [field, label] of hourFields) {
    const value = Number(record[field]);

    if (!Number.isFinite(value) || value < 0 || value > 24) {
      return `Informe um valor entre 0 e 24 para ${label}.`;
    }
  }

  const dailyTrackedHours = record.sleepHours + record.studyHours + record.screenTime;

  if (dailyTrackedHours > 24) {
    return `Sono, estudo e tempo de tela somam ${dailyTrackedHours} horas. Ajuste os valores para não ultrapassar 24 horas no mesmo dia.`;
  }

  return "";
}
