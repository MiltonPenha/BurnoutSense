"use client";

import Link from "next/link";
import { useState } from "react";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";
import { emojiForMood, formatDateShort, formatHours, getRecordRisk, riskMetaLabel } from "@/lib/burnout-data";

export default function HistoricoPage() {
  const { deleteRecord, records } = useBurnoutStore();
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const latestRisk = records.length ? getRecordRisk(records[0]) : null;

  function requestDelete(event, record) {
    event.preventDefault();
    event.stopPropagation();
    setDeleteError("");
    setRecordToDelete(record);
  }

  async function confirmDelete() {
    if (!recordToDelete) {
      return;
    }

    try {
      await deleteRecord(recordToDelete.id);
      setRecordToDelete(null);
      setDeleteError("");
    } catch {
      setDeleteError("Não foi possível excluir o registro. Tente novamente.");
    }
  }

  return (
    <section className="page history-page">
      <header className="page-header compact-header">
        <div>
          <p className="overline">Linha do tempo</p>
          <h1 className="page-title">Histórico de registros</h1>
          <p className="page-kicker">Acompanhe padrões, edite registros e compare sua evolução preventiva ao longo do tempo.</p>
        </div>
      </header>

      {records.length === 0 ? (
        <section className="card empty-state">
          <div>
            <p className="overline">Histórico vazio</p>
            <h2 className="risk-title">Nenhum registro criado</h2>
            <p className="page-kicker">Os registros aparecerão aqui assim que você preencher o formulário diário.</p>
          </div>
        </section>
      ) : (
        <>
          <div className="history-summary">
            <article className="card history-summary-card">
              <span>Total</span>
              <strong>{records.length}</strong>
              <small>registros salvos</small>
            </article>
            <article className={`card history-summary-card tone-${latestRisk.tone}`}>
              <span>Registro recente</span>
              <strong>{latestRisk.label}</strong>
              <small>{riskMetaLabel(latestRisk)}</small>
            </article>
            <article className="card history-summary-card">
              <span>Última atualização</span>
              <strong>{formatDateShort(records[0].date)}</strong>
              <small>{recordLabel(records.length)}</small>
            </article>
          </div>

          <div className="history-list timeline-list">
            {records.map((record) => {
              const risk = getRecordRisk(record);
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
                      <div className={`risk-pill tone-${risk.tone}`}>{risk.label} - {riskMetaLabel(risk)}</div>
                      <div className="history-meta">
                        <span><i className="meta-icon emoji-icon" aria-hidden="true">{emojiForMood(record.mood)}</i> {record.mood}</span>
                        <span><i className="meta-icon emoji-icon" aria-hidden="true">⚡</i> Estresse: {record.stress}/10</span>
                        <span><i className="meta-icon emoji-icon" aria-hidden="true">🌙</i> Sono: {formatHours(record.sleepHours)}</span>
                        <span><i className="meta-icon emoji-icon" aria-hidden="true">📚</i> Pressão: {record.examPressure ?? 5}/10</span>
                      </div>
                    </div>
                    <span className="chevron" aria-hidden="true">›</span>
                  </Link>
                  <div className="history-actions">
                    <Link className="history-edit" href={`/registro?edit=${record.id}`}>
                      <span className="history-action-emoji emoji-icon" aria-hidden="true">✏️</span>
                      <span>Editar</span>
                    </Link>
                    <button className="history-delete" type="button" onClick={(event) => requestDelete(event, record)}>
                      <span className="history-action-emoji emoji-icon" aria-hidden="true">🗑️</span>
                      <span>Excluir</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <p className="footer-note" style={{ marginTop: 60 }}>BurnoutSense é uma ferramenta de apoio preventivo e não substitui acompanhamento médico ou psicológico.</p>

      {recordToDelete ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-record-title">
            <p className="overline">Exclusão de registro</p>
            <h2 className="confirm-title" id="delete-record-title">Excluir este registro?</h2>
            <p className="confirm-copy">
              O registro de {formatDateShort(recordToDelete.date)} será removido do seu histórico junto com o resultado associado.
            </p>
            {deleteError ? <p className="form-error">{deleteError}</p> : null}
            <div className="confirm-actions">
              <button className="button secondary" type="button" onClick={() => setRecordToDelete(null)}>
                Cancelar
              </button>
              <button className="button danger" type="button" onClick={confirmDelete}>
                Excluir registro
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function recordLabel(total) {
  return total === 1 ? "primeiro registro" : "histórico em evolução";
}
