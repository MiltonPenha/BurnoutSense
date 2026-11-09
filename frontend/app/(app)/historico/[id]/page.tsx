"use client";
import "./detalhe.css";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteRecord, getEsbeuForm, getRecordById } from "@/lib/burnout-api";
import { EsbeuResult } from "@/components/indicators/EsbeuResult";
import { assessmentDate } from "@/components/indicators/EsbeuHistoryTable";
import { getError } from "@/lib/errors";
import type { AssessmentDetail, FormSchema } from "@/lib/types";

export default function AvaliacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<AssessmentDetail | null>(null);
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    getRecordById(id).then((value) => { if (active) setRecord(value); }).catch((failure) => {
      if (active) setError(getError(failure).status === 404 ? "Avaliação não encontrada nesta conta." : "Não foi possível consultar a avaliação.");
    });
    getEsbeuForm().then((value) => { if (active) setSchema(value); }).catch(() => {});
    return () => { active = false; };
  }, [id]);
  async function remove() {
    setBusy(true); setError("");
    try { await deleteRecord(id); window.dispatchEvent(new Event("burnoutsense-esbeu-change")); router.replace("/historico"); }
    catch { setError("Não foi possível confirmar a exclusão. Consulte o histórico antes de repetir."); setBusy(false); }
  }
  const names = Object.fromEntries((schema?.fields ?? []).map((field) => [field.identifier, field.name]));
  return <section className="page esbeu-page"><header className="page-header"><Link href="/historico" className="esbeu-link">← Voltar ao histórico</Link><h1 className="page-title">Seu registro e seus indicadores</h1></header>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!record && !error && <p role="status">Carregando avaliação…</p>}
    {record && <><p>Registrada em {assessmentDate(record.createdAt)}.</p><EsbeuResult record={record} />
      <section className="card"><h2>Suas respostas</h2><p>{record.source === "daily_experimental" ? "Estas são as informações usadas neste cálculo: parte vem dos seus dias registrados e parte da última rotina completa que você informou." : "Estas são as respostas que você enviou neste registro."}</p>
        <dl className="esbeu-context-list">{Object.entries(record.context).map(([key, value]) => <div key={key}><dt>{names[key] ?? key}</dt><dd>{String(value)}</dd></div>)}</dl></section>
      {record.observedItems && <details className="card"><summary>Ver os 14 itens respondidos</summary><dl className="esbeu-context-list">{Object.entries(record.observedItems).map(([key, value]) => <div key={key}><dt>{names[key] ?? key}</dt><dd>{value}</dd></div>)}</dl></details>}
      <section className="card"><h2>Excluir esta avaliação</h2><p>A exclusão remove as respostas e resultados desta avaliação da sua conta.</p>
        {!confirmDelete ? <button className="button danger" type="button" onClick={() => setConfirmDelete(true)}>Excluir avaliação</button>
          : <div role="group" aria-label="Confirmar exclusão"><p>Confirmar a exclusão permanente desta avaliação?</p><div className="form-actions"><button className="button danger" type="button" disabled={busy} onClick={remove}>{busy ? "Excluindo…" : "Confirmar exclusão"}</button><button className="button secondary" type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar</button></div></div>}
      </section>
    </>}
  </section>;
}
