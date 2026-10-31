"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getEsbeuMetrics, getRecords } from "@/lib/burnout-api";
import { EsbeuResult } from "@/components/EsbeuResult";
import { EsbeuHistoryTable } from "@/components/EsbeuHistoryTable";
import { EsbeuTrend } from "@/components/EsbeuTrend";

const modelNames = { dummy: "Referência Dummy", linear: "Regressão linear", ridge: "Ridge", random_forest: "Random Forest", svr: "SVR" };
const metric = (stat) => typeof stat?.mean === "number" ? `${stat.mean.toFixed(4)}${typeof stat.std === "number" ? ` ± ${stat.std.toFixed(4)}` : ""}` : "Indefinido";

export default function DashboardPage() {
  const [records, setRecords] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState("");
  const [metricsError, setMetricsError] = useState("");
  useEffect(() => {
    let active = true;
    getRecords().then((value) => { if (active) setRecords(value); }).catch(() => { if (active) setError("Não foi possível consultar suas avaliações. Tente novamente mais tarde."); });
    getEsbeuMetrics().then((value) => { if (active) setMetrics(value); }).catch(() => { if (active) setMetricsError("As métricas do modelo estão indisponíveis. Seu histórico salvo continua independente desse serviço."); });
    return () => { active = false; };
  }, []);
  return <section className="page esbeu-page">
    <header className="page-header"><p className="overline">Seu acompanhamento</p><h1 className="page-title">Dashboard ESB-eu</h1>
      <p className="page-kicker">Escores contínuos de 0 a 4. Estimativa contextual e medição direta são resultados distintos.</p>
      <Link href="/registro" className="button">Nova avaliação</Link></header>
    {error && <p role="alert" className="form-error">{error}</p>}
    {records === null && !error && <p role="status">Carregando avaliações…</p>}
    {records?.length === 0 && <section className="card empty-state"><h2>Seu acompanhamento começa aqui</h2><p>Você ainda não possui avaliações ESB-eu. Responda ao contexto para obter sua primeira estimativa.</p><Link href="/registro" className="button">Responder ao formulário</Link></section>}
    {records?.length > 0 && <><h2>Última avaliação</h2><EsbeuResult record={records[0]} /><EsbeuTrend records={records} />
      <section className="card"><h2>Avaliações recentes</h2><EsbeuHistoryTable records={records.slice(0, 5)} /><Link href="/historico" className="esbeu-link">Ver histórico completo</Link></section></>}
    <section className="card"><h2>Validação interna do modelo</h2>
      <p>As métricas abaixo descrevem a avaliação científica do modelo, não a confiança de uma previsão individual. Não são validação clínica nem teste em uma população externa independente.</p>
      {metricsError && <p role="status">{metricsError}</p>}
      {!metrics && !metricsError && <p role="status">Consultando métricas…</p>}
      {metrics && <><p>Base: {metrics.dataset_version} · {metrics.training_records} respostas válidas · Modelo selecionado: {modelNames[metrics.selected_model] ?? metrics.selected_model}.</p>
        <div className="esbeu-table-scroll" tabIndex={0} role="region" aria-label="Tabela de métricas; role horizontalmente para ver todas as colunas"><table className="esbeu-table"><caption>Média ± desvio padrão dos folds externos; não é intervalo de confiança.</caption>
          <thead><tr><th>Família</th><th>MAE ↓</th><th>RMSE ↓</th><th>R² ↑</th></tr></thead>
          <tbody>{metrics.family_comparisons.map((row) => <tr key={row.name}><th>{modelNames[row.name] ?? row.name}</th><td>{metric(row.mae)}</td><td>{metric(row.rmse)}</td><td>{metric(row.r2)}</td></tr>)}</tbody>
          <tfoot><tr><th>Procedimento de seleção</th><td>{metric(metrics.selection_procedure.mae)}</td><td>{metric(metrics.selection_procedure.rmse)}</td><td>{metric(metrics.selection_procedure.r2)}</td></tr></tfoot>
        </table></div>
        <p>Ideais matemáticos: MAE = 0, RMSE = 0 e R² = 1. Valores negativos de R² são possíveis e foram preservados. Menor erro médio de uma família não altera retrospectivamente o modelo escolhido pelo protocolo interno.</p>
      </>}
    </section>
  </section>;
}
