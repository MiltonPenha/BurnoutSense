"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TrendChart } from "@/components/TrendChart";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";
import { buildAlerts, calculateRisk, formatDateLong } from "@/lib/burnout-data";

function MetricCard({ icon, label, note, value }) {
  return (
    <article className="card metric-card">
      <div className="metric-label">
        <span className="metric-icon" aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </article>
  );
}

export default function DashboardPage() {
  const { latestRecord, profile, ready, records } = useBurnoutStore();
  const [recordNotice, setRecordNotice] = useState("");
  const risk = latestRecord ? calculateRisk(latestRecord) : null;
  const alerts = latestRecord ? buildAlerts(latestRecord) : [];

  useEffect(() => {
    const savedRecordStatus = window.sessionStorage.getItem("burnoutsense.recordSaved");

    if (!savedRecordStatus) {
      return undefined;
    }

    window.sessionStorage.removeItem("burnoutsense.recordSaved");
    const showTimer = window.setTimeout(() => {
      setRecordNotice(
        savedRecordStatus === "updated"
          ? "Registro atualizado com sucesso. Sua análise preventiva já foi recalculada."
          : "Registro criado com sucesso. Sua análise preventiva já foi atualizada."
      );
    }, 0);

    const hideTimer = window.setTimeout(() => setRecordNotice(""), 5000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!ready) {
    return (
      <section className="page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Carregando...</h1>
            <p className="page-kicker">Preparando seu painel.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Olá, {profile.name}</h1>
          <p className="page-kicker">Veja como está sua semana e registre seu dia.</p>
        </div>
        <Link className="button" href="/registro">
          <span aria-hidden="true">➕</span>
          <span>Novo registro</span>
        </Link>
      </header>

      {recordNotice ? (
        <div className="inline-notice success" role="status">
          {recordNotice}
        </div>
      ) : null}

      {!latestRecord ? (
        <section className="card empty-state">
          <div>
            <p className="overline">Nenhum registro ainda</p>
            <h2 className="risk-title">Comece pelo seu primeiro registro</h2>
            <p className="page-kicker">Depois que você preencher o registro diário, o dashboard exibirá risco, métricas, gráficos e alertas preventivos.</p>
          </div>
          <Link className="button" href="/registro">Criar registro</Link>
        </section>
      ) : (
        <>
          <div className={`risk-banner tone-${risk.tone}`}>
            <div>
              <p className="overline">Nível atual de risco</p>
              <h2 className="risk-title">{risk.label}</h2>
              <p className="risk-meta">Pontuação: {risk.score} · Registro de {formatDateLong(latestRecord.date)}</p>
            </div>
            <Link className="button secondary" href="/historico">Ver análise</Link>
          </div>

          <div className="metrics-grid">
            <MetricCard icon="🌙" label="Horas de sono" value={`${latestRecord.sleepHours}h`} note={`Qualidade ${latestRecord.sleepQuality}/10`} />
            <MetricCard icon="🧠" label="Estresse" value={`${latestRecord.stress}/10`} note={`Cansaço ${latestRecord.tiredness}/10`} />
            <MetricCard icon="📚" label="Carga acadêmica" value={`${latestRecord.studyHours}h`} note={`Pressão ${latestRecord.examPressure ?? 5}/10`} />
            <MetricCard icon="🙂" label="Contexto" value={latestRecord.mood} note={`Tela ${latestRecord.screenTime ?? 0}h`} />
          </div>

          <div className="charts-grid">
            <TrendChart color="#FDBA74" records={records} title="Evolução do estresse" valueKey="stress" />
            <TrendChart color="#34D399" records={records} title="Qualidade do sono" valueKey="sleepQuality" />
          </div>

          <section className="card alert-card">
            <h2 className="alert-title">
              <span aria-hidden="true">⚠️</span>
              <span>Alertas preventivos</span>
            </h2>
            <ul className="alert-list">
              {alerts.map((alert) => <li key={alert}>{alert}</li>)}
            </ul>
          </section>
        </>
      )}

      <p className="footer-note">BurnoutSense é uma ferramenta de apoio preventivo e não substitui acompanhamento médico ou psicológico.</p>
    </section>
  );
}
