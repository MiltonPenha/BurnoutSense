"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { moods } from "@/lib/burnout-data";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function RegistroPage() {
  const router = useRouter();
  const { addRecord, latestRecord } = useBurnoutStore();
  const [form, setForm] = useState({
    date: todayIso(),
    sleepHours: latestRecord?.sleepHours ?? 7,
    studyHours: latestRecord?.studyHours ?? 4,
    workHours: latestRecord?.workHours ?? 0,
    pendingTasks: latestRecord?.pendingTasks ?? 2,
    importantDelivery: false,
    sleepQuality: 7,
    stress: 5,
    tiredness: 5,
    mood: "Calmo",
    notes: ""
  });

  const moodOptions = useMemo(() => moods, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    await addRecord({
      ...form,
      id: `record-${form.date}-${Date.now()}`,
      sleepHours: Number(form.sleepHours),
      studyHours: Number(form.studyHours),
      workHours: Number(form.workHours),
      pendingTasks: Number(form.pendingTasks),
      sleepQuality: Number(form.sleepQuality),
      stress: Number(form.stress),
      tiredness: Number(form.tiredness)
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
          <h2 className="section-title">Dados do dia</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="date">Data do registro</label>
              <input className="input" id="date" type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="sleepHours">Horas de sono</label>
              <input className="input" id="sleepHours" min="0" max="18" type="number" value={form.sleepHours} onChange={(event) => updateField("sleepHours", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="studyHours">Horas de estudo</label>
              <input className="input" id="studyHours" min="0" max="18" type="number" value={form.studyHours} onChange={(event) => updateField("studyHours", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="workHours">Horas de trabalho</label>
              <input className="input" id="workHours" min="0" max="18" type="number" value={form.workHours} onChange={(event) => updateField("workHours", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pendingTasks">Tarefas acadêmicas pendentes</label>
              <input className="input" id="pendingTasks" min="0" max="30" type="number" value={form.pendingTasks} onChange={(event) => updateField("pendingTasks", event.target.value)} />
            </div>
            <div className="field toggle-row">
              <span className="field-label">Teve prova ou entrega importante?</span>
              <label className="toggle-control">
                <span className="switch">
                  <input checked={form.importantDelivery} type="checkbox" onChange={(event) => updateField("importantDelivery", event.target.checked)} />
                  <span className="switch-track" />
                </span>
                <span>{form.importantDelivery ? "Sim" : "Não"}</span>
              </label>
            </div>
          </div>
        </section>

        <section className="card form-card">
          <h2 className="section-title">Como você se sentiu</h2>

          {[
            ["sleepQuality", "Qualidade do sono"],
            ["stress", "Nível de estresse"],
            ["tiredness", "Nível de cansaço"]
          ].map(([field, label]) => (
            <div className="range-row" key={field}>
              <div className="range-head">
                <label htmlFor={field}>{label}</label>
                <span className="range-value">{form[field]}/10</span>
              </div>
              <input className="range" id={field} min="0" max="10" type="range" value={form[field]} onChange={(event) => updateField(field, event.target.value)} />
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
              placeholder="Compartilhe seus sentimentos, dificuldades e situações que afetaram sua rotina..."
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
