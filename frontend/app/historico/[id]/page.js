"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";
import { buildAlerts, calculateRisk, formatDateLong } from "@/lib/burnout-data";

export default function HistoricoDetalhePage() {
  const params = useParams();
  const { findRecord, ready } = useBurnoutStore();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadRecord() {
      if (!ready) {
        return;
      }

      setLoading(true);
      const foundRecord = await findRecord(params.id);

      if (active) {
        setRecord(foundRecord);
        setLoading(false);
      }
    }

    loadRecord();

    return () => {
      active = false;
    };
  }, [findRecord, params.id, ready]);

  if (loading) {
    return (
      <section className="page page-narrow">
        <p className="page-kicker">Carregando registro...</p>
      </section>
    );
  }

  if (!record) {
    return (
      <section className="page page-narrow">
        <header className="page-header">
          <div>
            <h1 className="page-title">Registro nao encontrado</h1>
            <p className="page-kicker">Esse item pode ter sido removido ou ainda nao existe no backend.</p>
          </div>
        </header>
        <Link className="button secondary" href="/historico">Voltar ao historico</Link>
      </section>
    );
  }

  const risk = calculateRisk(record);
  const alerts = buildAlerts(record);

  return (
    <section className="page page-narrow">
      <header className="page-header">
        <div>
          <h1 className="page-title">Detalhe do registro</h1>
          <p className="page-kicker">Analise preventiva do dia {formatDateLong(record.date)}.</p>
        </div>
        <Link className="button secondary" href="/historico">Voltar</Link>
      </header>

      <section className="risk-banner detail-risk">
        <div>
          <p className="overline">Classificacao preventiva</p>
          <h2 className="risk-title">{risk.label}</h2>
          <p className="risk-meta">Pontuacao: {risk.score} pts</p>
        </div>
      </section>

      <section className="card detail-card">
        <h2 className="section-title">Resumo do dia</h2>
        <div className="detail-grid">
          <div>
            <span className="detail-label">Sono</span>
            <strong>{record.sleepHours}h</strong>
            <small>Qualidade {record.sleepQuality}/10</small>
          </div>
          <div>
            <span className="detail-label">Estresse</span>
            <strong>{record.stress}/10</strong>
            <small>Cansaco {record.tiredness}/10</small>
          </div>
          <div>
            <span className="detail-label">Estudos</span>
            <strong>{record.studyHours}h</strong>
            <small>{record.pendingTasks} tarefas pendentes</small>
          </div>
          <div>
            <span className="detail-label">Humor</span>
            <strong>{record.mood}</strong>
            <small>{record.importantDelivery ? "Com entrega importante" : "Sem entrega importante"}</small>
          </div>
        </div>
      </section>

      <section className="card detail-card">
        <h2 className="section-title">Alertas preventivos</h2>
        <ul className="alert-list">
          {alerts.map((alert) => <li key={alert}>{alert}</li>)}
        </ul>
      </section>

      <section className="card detail-card">
        <h2 className="section-title">Observacoes</h2>
        <p className="detail-notes">{record.notes || "Nenhuma observacao registrada para este dia."}</p>
      </section>
    </section>
  );
}
