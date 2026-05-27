"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { moods } from "@/lib/burnout-data";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function valueFromLatest(latestRecord, key, fallback) {
  return latestRecord?.[key] ?? fallback;
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
    physicalActivity: valueFromLatest(latestRecord, "physicalActivity", 3),
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
              <input className="input" id="date" type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} />
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
          ].map(([field, label]) => (
            <div className="range-row" key={field}>
              <div className="range-head">
                <label htmlFor={field}>{label}</label>
                <span className="range-value">{form[field]}/10</span>
              </div>
              <input className="range" id={field} min="0" max="10" type="range" value={form[field]} onChange={(event) => updateField(field, event.target.value)} />
            </div>
          ))}
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
          ].map(([field, label]) => (
            <div className="range-row" key={field}>
              <div className="range-head">
                <label htmlFor={field}>{label}</label>
                <span className="range-value">{form[field]}/{field === "physicalActivity" ? "7" : "10"}</span>
              </div>
              <input className="range" id={field} min="0" max={field === "physicalActivity" ? "7" : "10"} type="range" value={form[field]} onChange={(event) => updateField(field, event.target.value)} />
            </div>
          ))}

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
