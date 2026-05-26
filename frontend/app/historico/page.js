"use client";

import Link from "next/link";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";
import { calculateRisk, formatDateShort } from "@/lib/burnout-data";

export default function HistoricoPage() {
  const { records } = useBurnoutStore();

  return (
    <section className="page page-narrow">
      <header className="page-header">
        <div>
          <h1 className="page-title">Histórico de registros</h1>
          <p className="page-kicker">Acompanhe a evolução do seu bem-estar ao longo do tempo.</p>
        </div>
      </header>

      {records.length === 0 ? (
        <section className="card empty-state">
          <div>
            <p className="overline">Historico vazio</p>
            <h2 className="risk-title">Nenhum registro criado</h2>
            <p className="page-kicker">Os registros aparecerao aqui assim que voce preencher o formulario diario.</p>
          </div>
          <Link className="button" href="/registro">Criar registro</Link>
        </section>
      ) : (
        <div className="history-list">
          {records.map((record) => {
            const risk = calculateRisk(record);
            const [day, month] = formatDateShort(record.date).split("/");
            const year = record.date.slice(0, 4);

            return (
              <Link className="history-item" href={`/historico/${record.id}`} key={record.id}>
                <div className="history-date">
                  <span>{day}/{month}</span>
                  <span>{year}</span>
                </div>
                <div className="history-content">
                  <div className="risk-pill">{risk.label} · {risk.score} pts</div>
                  <div className="history-meta">
                    <span>☻ {record.mood.toLowerCase()}</span>
                    <span>⌁ estresse {record.stress}/10</span>
                    <span>◔ sono {record.sleepHours}h</span>
                  </div>
                </div>
                <span className="chevron" aria-hidden="true">›</span>
              </Link>
            );
          })}
        </div>
      )}

      <p className="footer-note" style={{ marginTop: 60 }}>BurnoutSense é uma ferramenta de apoio preventivo e não substitui acompanhamento médico ou psicológico.</p>
    </section>
  );
}
