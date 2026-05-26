"use client";

import Link from "next/link";
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
  const risk = latestRecord ? calculateRisk(latestRecord) : null;
  const alerts = latestRecord ? buildAlerts(latestRecord) : [];

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
          <h1 className="page-title">Ola, {profile.name} 👋</h1>
          <p className="page-kicker">Veja como esta sua semana e registre seu dia.</p>
        </div>
        <Link className="button" href="/registro">
          <span aria-hidden="true">+</span>
          <span>Novo registro</span>
        </Link>
      </header>

      {!latestRecord ? (
        <section className="card empty-state">
          <div>
            <p className="overline">Nenhum registro ainda</p>
            <h2 className="risk-title">Comece pelo seu primeiro registro</h2>
            <p className="page-kicker">Depois que voce preencher o registro diario, o dashboard exibira risco, metricas, graficos e alertas preventivos.</p>
          </div>
          <Link className="button" href="/registro">Criar registro</Link>
        </section>
      ) : (
        <>
          <div className="risk-banner">
            <div>
              <p className="overline">Nivel atual de risco</p>
              <h2 className="risk-title">{risk.label}</h2>
              <p className="risk-meta">Pontuacao: {risk.score} · Registro de {formatDateLong(latestRecord.date)}</p>
            </div>
            <Link className="button secondary" href="/historico">Ver analise</Link>
          </div>

          <div className="metrics-grid">
            <MetricCard icon="◔" label="Horas de sono" value={`${latestRecord.sleepHours}h`} note={`Qualidade ${latestRecord.sleepQuality}/10`} />
            <MetricCard icon="⌁" label="Estresse" value={`${latestRecord.stress}/10`} note={`Cansaco ${latestRecord.tiredness}/10`} />
            <MetricCard icon="▱" label="Carga de estudo" value={`${latestRecord.studyHours}h`} note={`${latestRecord.pendingTasks} tarefas pendentes`} />
            <MetricCard icon="☻" label="Humor" value={latestRecord.mood} note={latestRecord.importantDelivery ? "Com entrega importante" : "Sem entregas criticas"} />
          </div>

          <div className="charts-grid">
            <TrendChart color="#FDBA74" records={records} title="Evolucao do estresse" valueKey="stress" />
            <TrendChart color="#34D399" records={records} title="Qualidade do sono" valueKey="sleepQuality" />
          </div>

          <section className="card alert-card">
            <h2 className="alert-title">
              <span aria-hidden="true">△</span>
              <span>Alertas preventivos</span>
            </h2>
            <ul className="alert-list">
              {alerts.map((alert) => <li key={alert}>{alert}</li>)}
            </ul>
          </section>
        </>
      )}

      <p className="footer-note">BurnoutSense e uma ferramenta de apoio preventivo e nao substitui acompanhamento medico ou psicologico.</p>
    </section>
  );
}
