"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TrendChart } from "@/components/TrendChart";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";
import { buildAlerts, calculateRisk, formatDateLong, formatHours } from "@/lib/burnout-data";

function average(records, key) {
  if (!records.length) {
    return 0;
  }

  const total = records.reduce((sum, record) => sum + Number(record[key] ?? 0), 0);
  return Math.round((total / records.length) * 10) / 10;
}

function riskDescription(tone) {
  if (tone === "danger") {
    return "Sinais críticos exigem atenção e pequenas mudanças imediatas na rotina.";
  }

  if (tone === "warning") {
    return "Sinais intermediários pedem acompanhamento próximo e pausas planejadas.";
  }

  return "Indicadores recentes em uma faixa mais tranquila.";
}

function buildRecommendations(record) {
  const recommendations = [];

  if (record.stress >= 7 || record.tiredness >= 7) {
    recommendations.push({
      icon: "🧘",
      title: "Reduza a intensidade do próximo bloco",
      text: "Divida tarefas longas em ciclos menores e faça uma pausa real antes de retomar."
    });
  }

  if (record.sleepHours < 7 || record.sleepQuality < 6) {
    recommendations.push({
      icon: "🌙",
      title: "Proteja o sono de hoje",
      text: "Evite acumular estudo no fim da noite e tente manter um horário fixo para desacelerar."
    });
  }

  if ((record.examPressure ?? 0) >= 7) {
    recommendations.push({
      icon: "📚",
      title: "Organize a pressão acadêmica",
      text: "Liste o que é essencial para a próxima entrega e deixe o restante como melhoria opcional."
    });
  }

  if ((record.socialSupport ?? 6) <= 4) {
    recommendations.push({
      icon: "🤝",
      title: "Busque apoio antes de isolar",
      text: "Compartilhe uma dificuldade com colega, professor ou suporte institucional."
    });
  }

  if (!recommendations.length) {
    recommendations.push(
      {
        icon: "⚖️",
        title: "Mantenha o acompanhamento",
        text: "Continue registrando pequenos sinais. A evolução do histórico ajuda a perceber padrões."
      },
      {
        icon: "☕",
        title: "Reserve uma pausa curta",
        text: "Mesmo em dias bons, pausas breves ajudam a manter consistência sem sobrecarga."
      }
    );
  }

  return recommendations.slice(0, 3);
}

function MetricCard({ icon, label, note, tone = "blue", value }) {
  return (
    <article className={`card metric-card metric-${tone}`}>
      <div className="metric-label">
        <span className="metric-icon emoji-icon" aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </article>
  );
}

function MiniStat({ icon, label, value, tone }) {
  return (
    <article className={`card overview-card stat-${tone}`}>
      <span className="overview-icon emoji-icon" aria-hidden="true">{icon}</span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

export default function DashboardPage() {
  const { latestRecord, profile, ready, records } = useBurnoutStore();
  const [recordNotice, setRecordNotice] = useState("");
  const risk = latestRecord ? calculateRisk(latestRecord) : null;
  const alerts = latestRecord ? buildAlerts(latestRecord) : [];
  const recommendations = latestRecord ? buildRecommendations(latestRecord) : [];

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
      <section className="page dashboard-page">
        <header className="page-header compact-header">
          <div>
            <p className="overline">Painel preventivo</p>
            <h1 className="page-title">Carregando...</h1>
            <p className="page-kicker">Preparando seu painel.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="page dashboard-page">
      <header className="page-header compact-header">
        <div>
          <p className="overline">Painel preventivo</p>
          <h1 className="page-title">Olá, {profile.name}</h1>
          <p className="page-kicker">Um resumo claro da sua rotina acadêmica, bem-estar e sinais de atenção.</p>
        </div>
        <Link className="button" href="/registro">
          <span aria-hidden="true">+</span>
          <span>Novo registro</span>
        </Link>
      </header>

      {recordNotice ? (
        <div className="inline-notice success" role="status" style={{ "--notice-duration": "5s" }}>
          {recordNotice}
        </div>
      ) : null}

      {!latestRecord ? (
        <section className="card empty-state elevated-empty">
          <div>
            <p className="overline">Nenhum registro ainda</p>
            <h2 className="risk-title">Comece pelo seu primeiro registro</h2>
            <p className="page-kicker">Depois do primeiro envio, o painel apresenta risco, métricas, gráficos e recomendações preventivas.</p>
          </div>
          <Link className="button" href="/registro">Criar registro</Link>
        </section>
      ) : (
        <>
          <div className={`risk-banner dashboard-risk tone-${risk.tone}`}>
            <div>
              <p className="overline">Nível atual de risco</p>
              <h2 className="risk-title">{risk.label}</h2>
              <p className="risk-meta">Pontuação: {risk.score} · Registro de {formatDateLong(latestRecord.date)}</p>
              <p className="risk-support">{riskDescription(risk.tone)}</p>
            </div>
            <div className="risk-actions">
              <span className="risk-score">{risk.score}</span>
              <Link className="button secondary" href="/historico">Ver análise</Link>
            </div>
          </div>

          <div className="overview-grid">
            <MiniStat icon="📈" label="registros acompanhados" value={records.length} tone="blue" />
            <MiniStat icon="⚡" label="média de estresse" value={`${average(records, "stress")}/10`} tone="amber" />
            <MiniStat icon="🌙" label="média de sono" value={`${average(records, "sleepQuality")}/10`} tone="mint" />
          </div>

          <div className="metrics-grid">
            <MetricCard icon="🌙" label="Horas de sono" value={formatHours(latestRecord.sleepHours)} note={`Qualidade: ${latestRecord.sleepQuality}/10`} tone="blue" />
            <MetricCard icon="⚡" label="Estresse" value={`${latestRecord.stress}/10`} note={`Cansaço: ${latestRecord.tiredness}/10`} tone={latestRecord.stress >= 8 ? "danger" : "peach"} />
            <MetricCard icon="📚" label="Carga acadêmica" value={formatHours(latestRecord.studyHours)} note={`Pressão: ${latestRecord.examPressure ?? 5}/10`} tone="lavender" />
            <MetricCard icon="🧭" label="Contexto" value={latestRecord.mood} note={`Tela: ${formatHours(latestRecord.screenTime ?? 0)}`} tone="rose" />
          </div>

          <div className="dashboard-grid">
            <TrendChart color="#F59E0B" records={records} title="Evolução do estresse" valueKey="stress" />
            <TrendChart color="#14B8A6" records={records} title="Qualidade do sono" valueKey="sleepQuality" />
          </div>

          <div className="dashboard-bottom-grid">
            <section className="card alert-card">
              <h2 className="alert-title">
                <span className="alert-icon emoji-icon" aria-hidden="true">⚠️</span>
                <span>Alertas preventivos</span>
              </h2>
              <ul className="alert-list">
                {alerts.map((alert) => <li key={alert}>{alert}</li>)}
              </ul>
            </section>

            <section className="card recommendations-card">
              <div className="section-head">
                <h2 className="card-title">Dicas e recomendações</h2>
                <span>Baseado no último registro</span>
              </div>
              <div className="recommendation-list">
                {recommendations.map((item) => (
                  <article className="recommendation-item" key={item.title}>
                    <span className="recommendation-icon emoji-icon" aria-hidden="true">{item.icon}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="method-strip" aria-label="Indicadores considerados">
            <span>Rotina acadêmica</span>
            <span>Qualidade do sono</span>
            <span>Estresse percebido</span>
            <span>Suporte e contexto</span>
          </section>
        </>
      )}

      <p className="footer-note">BurnoutSense é uma ferramenta de apoio preventivo e não substitui acompanhamento médico ou psicológico.</p>
    </section>
  );
}
