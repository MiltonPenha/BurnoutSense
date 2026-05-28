"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { moods } from "@/lib/burnout-data";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";

const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function valueFromLatest(latestRecord, key, fallback) {
  return latestRecord?.[key] ?? fallback;
}

function parseIsoDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const selectedDate = parseIsoDate(value);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const days = useMemo(() => buildCalendarDays(viewDate), [viewDate]);

  function toggleCalendar() {
    if (!open) {
      const nextSelectedDate = parseIsoDate(value);
      setViewDate(new Date(nextSelectedDate.getFullYear(), nextSelectedDate.getMonth(), 1));
    }

    setOpen((current) => !current);
  }

  function selectDate(date) {
    onChange(toIsoDate(date));
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
        <span aria-hidden="true">📅</span>
      </button>

      {open ? (
        <div className="calendar-popover" role="dialog" aria-label="Selecionar data do registro">
          <div className="calendar-head">
            <button aria-label="Mês anterior" className="calendar-nav" type="button" onClick={() => setViewDate((current) => addMonths(current, -1))}>
              ‹
            </button>
            <strong>{formatMonthLabel(viewDate)}</strong>
            <button aria-label="Próximo mês" className="calendar-nav" type="button" onClick={() => setViewDate((current) => addMonths(current, 1))}>
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
              const today = isoDate === todayIso();

              return (
                <button
                  className={`calendar-day ${outsideMonth ? "outside" : ""} ${selected ? "selected" : ""} ${today ? "today" : ""}`}
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

function RangeField({ field, label, value, onChange }) {
  return (
    <div className="range-row">
      <div className="range-head">
        <label htmlFor={field}>{label}</label>
        <span className="range-value">{value}/10</span>
      </div>
      <input
        className="range"
        id={field}
        min="0"
        max="10"
        style={{ "--range-progress": `${Number(value) * 10}%` }}
        type="range"
        value={value}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </div>
  );
}

export default function RegistroPage() {
  const router = useRouter();
  const { addRecord, latestRecord } = useBurnoutStore();
  const [form, setForm] = useState({
    date: todayIso(),
    sleepHours: valueFromLatest(latestRecord, "sleepHours", 7),
    studyHours: valueFromLatest(latestRecord, "studyHours", 4),
    screenTime: valueFromLatest(latestRecord, "screenTime", 5),
    academicPerformance: valueFromLatest(latestRecord, "academicPerformance", 7),
    examPressure: valueFromLatest(latestRecord, "examPressure", latestRecord?.importantDelivery ? 8 : 5),
    sleepQuality: valueFromLatest(latestRecord, "sleepQuality", 7),
    stress: valueFromLatest(latestRecord, "stress", 5),
    tiredness: valueFromLatest(latestRecord, "tiredness", 5),
    physicalActivity: valueFromLatest(latestRecord, "physicalActivity", 5),
    socialSupport: valueFromLatest(latestRecord, "socialSupport", 6),
    financialStress: valueFromLatest(latestRecord, "financialStress", 3),
    mood: valueFromLatest(latestRecord, "mood", "Calmo"),
    notes: ""
  });

  const moodOptions = useMemo(() => moods, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const academicPerformance = Number(form.academicPerformance);
    const examPressure = Number(form.examPressure);

    await addRecord({
      ...form,
      id: `record-${form.date}-${Date.now()}`,
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
    });

    window.sessionStorage.setItem("burnoutsense.recordCreated", "true");
    router.push("/dashboard");
  }

  return (
    <section className="page page-narrow">
      <header className="page-header">
        <div>
          <h1 className="page-title">Registro diário</h1>
          <p className="page-kicker">Conte como foi seu dia. Suas respostas geram uma análise preventiva.</p>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <section className="card form-card">
          <h2 className="section-title">Rotina acadêmica</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="date">Data do registro</label>
              <DatePicker value={form.date} onChange={(value) => updateField("date", value)} />
            </div>
            <div className="field">
              <label htmlFor="sleepHours">Horas de sono</label>
              <input className="input" id="sleepHours" min="0" max="18" step="0.5" type="number" value={form.sleepHours} onChange={(event) => updateField("sleepHours", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="studyHours">Horas de estudo</label>
              <input className="input" id="studyHours" min="0" max="18" step="0.5" type="number" value={form.studyHours} onChange={(event) => updateField("studyHours", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="screenTime">Tempo de tela</label>
              <input className="input" id="screenTime" min="0" max="24" step="0.5" type="number" value={form.screenTime} onChange={(event) => updateField("screenTime", event.target.value)} />
            </div>
          </div>

          {[
            ["academicPerformance", "Desempenho acadêmico percebido"],
            ["examPressure", "Pressão acadêmica"]
          ].map(([field, label]) => <RangeField field={field} key={field} label={label} value={form[field]} onChange={updateField} />)}
        </section>

        <section className="card form-card">
          <h2 className="section-title">Bem-estar e contexto</h2>

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
            <div className="mood-grid">
              {moodOptions.map((mood) => (
                <button
                  className={`mood-option ${form.mood === mood.name ? "active" : ""}`}
                  key={mood.name}
                  type="button"
                  onClick={() => updateField("mood", mood.name)}
                >
                  <span className="mood-emoji" aria-hidden="true">{mood.emoji}</span>
                  <span className="mood-name">{mood.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="notes">Descreva como foi seu dia</label>
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
          <button className="button secondary" type="button" onClick={() => router.push("/dashboard")}>Cancelar</button>
          <button className="button" type="submit">Gerar análise</button>
        </div>
      </form>
    </section>
  );
}
