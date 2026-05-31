"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TrendChart } from "@/components/TrendChart";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";
import { getAssessmentInsights } from "@/lib/burnout-api";
import { formatDateLong, formatHours, getRecordRisk } from "@/lib/burnout-data";

const INSIGHTS_CACHE_KEY = "burnoutsense.generatedInsights.v1";

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

function buildInsightsCacheKey(record) {
  return JSON.stringify({
    id: record.id,
    date: record.date,
    sleepHours: record.sleepHours,
    studyHours: record.studyHours,
    screenTime: record.screenTime,
    sleepQuality: record.sleepQuality,
    stress: record.stress,
    tiredness: record.tiredness,
    academicPerformance: record.academicPerformance,
    examPressure: record.examPressure,
    physicalActivity: record.physicalActivity,
    socialSupport: record.socialSupport,
    financialStress: record.financialStress,
    riskLevel: record.backendResult?.riskLevel,
    confidence: record.backendResult?.confidence,
    riskScore: record.backendResult?.riskScore,
    mainFactors: record.backendResult?.mainFactors
  });
}

function readCachedInsights(record) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(INSIGHTS_CACHE_KEY) ?? "{}");
    const cachedInsights = cache[buildInsightsCacheKey(record)] ?? null;
    return cachedInsights ? normalizeGeneratedInsights(cachedInsights) : null;
  } catch {
    return null;
  }
}

function writeCachedInsights(record, generatedInsights) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(INSIGHTS_CACHE_KEY) ?? "{}");
    cache[buildInsightsCacheKey(record)] = normalizeGeneratedInsights(generatedInsights);
    window.localStorage.setItem(INSIGHTS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Cache is only a performance hint; generation still works without it.
  }
}

function cleanGeneratedText(value) {
  return String(value ?? "").replace(/^\s*(alerta|atenção|atencao|dica|recomendação|recomendacao)\s*[:：-]\s*/i, "").trim();
}

function normalizeGeneratedInsights(generatedInsights) {
  return {
    alerts: (generatedInsights.alerts ?? []).map(cleanGeneratedText).filter(Boolean),
    recommendations: (generatedInsights.recommendations ?? []).map((item) => ({
      title: cleanGeneratedText(item.title),
      text: cleanGeneratedText(item.text)
    })).filter((item) => item.title && item.text)
  };
}

function MetricCard({ icon, label, note, tone = "blue", value }) {
  return (
    <article className={`card metric-card metric-${tone}`}>
      <div className="metric-label">
        <span className="metric-icon emoji-icon" aria-hidden="true"><span className="emoji-glyph">{icon}</span></span>
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
      <span className="overview-icon emoji-icon" aria-hidden="true"><span className="emoji-glyph">{icon}</span></span>
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
  const [insights, setInsights] = useState({ alerts: [], recommendations: [], loading: false, error: "" });
  const risk = latestRecord ? getRecordRisk(latestRecord) : null;
  const latestRecordInsightKey = latestRecord ? buildInsightsCacheKey(latestRecord) : "";
  const alerts = insights.alerts;
  const recommendations = insights.recommendations;
  const displayedRiskScore = Math.round(risk?.score ?? 0);

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

  useEffect(() => {
    let active = true;

    async function loadGeneratedInsights() {
      if (!latestRecord?.id) {
        setInsights({ alerts: [], recommendations: [], loading: false, error: "" });
        return;
      }

      const cachedInsights = readCachedInsights(latestRecord);

      if (cachedInsights) {
        setInsights({
          alerts: cachedInsights.alerts ?? [],
          recommendations: cachedInsights.recommendations ?? [],
          loading: false,
          error: ""
        });
        return;
      }

      setInsights({ alerts: [], recommendations: [], loading: true, error: "" });

      try {
        const generatedInsights = await getAssessmentInsights(latestRecord.id);

        if (!active) {
          return;
        }

        const normalizedInsights = normalizeGeneratedInsights(generatedInsights);
        writeCachedInsights(latestRecord, normalizedInsights);

        setInsights({
          alerts: normalizedInsights.alerts,
          recommendations: normalizedInsights.recommendations,
          loading: false,
          error: ""
        });
      } catch (error) {
        if (active) {
          setInsights({
            alerts: [],
            recommendations: [],
            loading: false,
            error: error?.message ?? "Não foi possível gerar alertas e recomendações agora."
          });
        }
      }
    }

    loadGeneratedInsights();

    return () => {
      active = false;
    };
  }, [latestRecord, latestRecordInsightKey]);

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
        <div className="topbar-actions">
          <Link className="button secondary" href="/status">Status</Link>
          <Link className="button" href="/registro">
            <span aria-hidden="true">+</span>
            <span>Novo registro</span>
          </Link>
        </div>
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
              <p className="risk-meta">Registro de {formatDateLong(latestRecord.date)}</p>
              <p className="risk-support">{riskDescription(risk.tone)}</p>
            </div>
            <div className="risk-actions">
              <span className="risk-score">{displayedRiskScore}</span>
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
            <MetricCard icon="⚡" label="Estresse" value={`${latestRecord.stress}/10`} note={`Cansaço: ${latestRecord.tiredness}/10`} tone={latestRecord.stress >= 8 ? "danger" : "blue"} />
            <MetricCard icon="📚" label="Carga acadêmica" value={formatHours(latestRecord.studyHours)} note={`Pressão: ${latestRecord.examPressure ?? 5}/10`} tone="mint" />
            <MetricCard icon="🧭" label="Contexto" value={latestRecord.mood} note={`Tela: ${formatHours(latestRecord.screenTime ?? 0)}`} tone="blue" />
          </div>

          <div className="dashboard-grid">
            <TrendChart color="#60A5FA" records={records} title="Evolução do estresse" valueKey="stress" />
            <TrendChart color="#34D399" records={records} title="Qualidade do sono" valueKey="sleepQuality" />
          </div>

          <div className="dashboard-bottom-grid">
            <section className="card alert-card">
              <div className="section-head">
                <h2 className="alert-title">
                  <span className="alert-icon emoji-icon" aria-hidden="true">
                    <span>⚠️</span>
                  </span>
                  <span>Alertas preventivos</span>
                </h2>
                <span>Gerado por IA</span>
              </div>
              {insights.loading ? <p className="page-kicker">Gerando alertas a partir do resultado real...</p> : null}
              {insights.error ? <p className="form-error">{insights.error}</p> : null}
              {!insights.loading && !insights.error ? (
                <ul className="alert-list">
                  {alerts.map((alert) => <li key={alert}>{alert}</li>)}
                </ul>
              ) : null}
            </section>

            <section className="card recommendations-card">
              <div className="section-head">
                <h2 className="card-title recommendation-title">
                  <span className="recommendation-title-icon emoji-icon" aria-hidden="true">💡</span>
                  <span>Dicas e recomendações</span>
                </h2>
                <span>Gerado por IA</span>
              </div>
              {insights.loading ? <p className="page-kicker">Gerando recomendações preventivas...</p> : null}
              {insights.error ? <p className="form-error">{insights.error}</p> : null}
              {!insights.loading && !insights.error ? (
                <ul className="recommendation-list">
                  {recommendations.map((item) => (
                    <li key={item.title}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </div>
        </>
      )}

      <p className="footer-note">BurnoutSense é uma ferramenta de apoio preventivo e não substitui acompanhamento médico ou psicológico.</p>
    </section>
  );
}
