"use client";

import Link from "next/link";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";
import { calculateRisk, formatDateShort } from "@/lib/burnout-data";

export default function HistoricoPage() {
  const { deleteRecord, records } = useBurnoutStore();

  async function handleDelete(event, recordId) {
    event.preventDefault();
    event.stopPropagation();

    const confirmed = window.confirm("Deseja excluir este registro? Essa ação não pode ser desfeita.");

    if (!confirmed) {
      return;
    }

    await deleteRecord(recordId);
  }

  return (
    <section className="page history-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Historico de registros</h1>
          <p className="page-kicker">Acompanhe a evolucao do seu bem-estar ao longo do tempo.</p>
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
              <article className="history-item" key={record.id}>
                <Link className="history-link" href={`/historico/${record.id}`}>
                  <div className="history-date">
                    <span>{day}/{month}</span>
                    <span>{year}</span>
                  </div>
                  <div className="history-content">
                    <div className="risk-pill">{risk.label} - {risk.score} pts</div>
                    <div className="history-meta">
                      <span>{record.mood.toLowerCase()}</span>
                      <span>estresse {record.stress}/10</span>
                      <span>sono {record.sleepHours}h</span>
                      <span>pressao {record.examPressure ?? 5}/10</span>
                    </div>
                  </div>
                  <span className="chevron" aria-hidden="true">{">"}</span>
                </Link>
                <button className="history-delete" type="button" onClick={(event) => handleDelete(event, record.id)}>
                  Excluir
                </button>
              </article>
            );
          })}
        </div>
      )}

      <p className="footer-note" style={{ marginTop: 60 }}>BurnoutSense e uma ferramenta de apoio preventivo e nao substitui acompanhamento medico ou psicologico.</p>
    </section>
  );
}
