"use client";

import { useEffect, useState } from "react";
import { getSystemStatus } from "@/lib/burnout-api";

const STATUS_LABELS = {
  loaded: "carregado",
  not_configured: "não configurado",
  offline: "offline",
  online: "online",
  unavailable: "indisponível"
};

function normalizeStatusLabel(value) {
  return STATUS_LABELS[value] ?? value ?? "indisponível";
}

function statusTone(value, loaded) {
  if (value === "online" || value === "loaded" || loaded === true) {
    return "success";
  }

  if (value === "not_configured") {
    return "warning";
  }

  return "danger";
}

const TRAINING_STRATEGY_LABELS = {
  custom_class_sampling: "Amostragem balanceada por classe",
  focused_high_recall_sampling: "Amostragem ajustada para melhorar as métricas",
  final_without_dropout_or_internet: "Sem variáveis de vazamento",
};

function formatModelName(modelName) {
  if (!modelName) {
    return "Modelo não informado";
  }

  return modelName.includes("Random Forest") ? "Random Forest" : modelName;
}

function formatTrainingStrategy(strategy) {
  if (!strategy) {
    return "";
  }

  return TRAINING_STRATEGY_LABELS[strategy] ?? strategy.replaceAll("_", " ");
}

function StatusCard({ label, note, status, tone }) {
  return (
    <article className={`card history-summary-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{status}</strong>
      <small>{note}</small>
    </article>
  );
}

export default function StatusPage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      setLoading(true);
      setError("");

      try {
        const nextStatus = await getSystemStatus();

        if (active) {
          setStatus(nextStatus);
        }
      } catch {
        if (active) {
          setError("Não foi possível consultar o status técnico agora.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadStatus();

    return () => {
      active = false;
    };
  }, []);

  const modelStatus = status?.model?.loaded ? "loaded" : status?.model?.status;
  const modelName = formatModelName(status?.model?.modelName);
  const trainingStrategy = formatTrainingStrategy(status?.model?.trainingStrategy);
  const modelNote = status?.model?.loaded
    ? trainingStrategy || "Estratégia de treinamento não informada"
    : normalizeStatusLabel(modelStatus);

  return (
    <section className="page">
      <header className="page-header compact-header">
        <div>
          <p className="overline">Homologação</p>
          <h1 className="page-title">Status técnico</h1>
          <p className="page-kicker">Visão rápida dos serviços necessários para demonstrar o fluxo completo do BurnoutSense.</p>
        </div>
      </header>

      {loading ? <p className="page-kicker">Consultando serviços...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {status ? (
        <>
          <div className="history-summary status-summary">
            <StatusCard
              label="Backend"
              note="API NestJS"
              status={normalizeStatusLabel(status.backend?.status)}
              tone={statusTone(status.backend?.status)}
            />
            <StatusCard
              label="Banco"
              note="PostgreSQL via Prisma"
              status={normalizeStatusLabel(status.database?.status)}
              tone={statusTone(status.database?.status)}
            />
            <StatusCard
              label="AI Service"
              note="FastAPI"
              status={normalizeStatusLabel(status.aiService?.status)}
              tone={statusTone(status.aiService?.status)}
            />
            <StatusCard
              label="Modelo de IA"
              note={modelNote}
              status={status.model?.loaded ? modelName : "indisponível"}
              tone={statusTone(modelStatus, status.model?.loaded)}
            />
          </div>

          <p className="footer-note">
            Última verificação: {status.checkedAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(status.checkedAt)) : "não informada"}
          </p>
        </>
      ) : null}
    </section>
  );
}
