"use client";

import "./ContextWizard.css";
import "./ReviewTopicPicker.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { getEsbeuForm, guidedReview } from "@/lib/burnout-api";
import { contextToInputs, formatIndex, readSchemaFields, reviewDetails, schemaFieldErrors, SchemaValidationError } from "@/lib/esbeu-form";
import { focusFormField } from "@/lib/form-focus";
import { getError } from "@/lib/errors";
import type { Assessment, AssessmentDetail, FormField, ReviewTopic } from "@/lib/types";
import { EsbeuResult } from "@/components/indicators/EsbeuResult";
import { SchemaField } from "./SchemaField";

export function GuidedReview({ assessment, topic }: { assessment: AssessmentDetail; topic: ReviewTopic }) {
  const [fields, setFields] = useState<FormField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [unchanged, setUnchanged] = useState(false);
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    getEsbeuForm().then(({ fields: schemaFields }) => {
      if (!active) return;
      const selected = schemaFields.filter((field) => topic.fieldIds.includes(field.identifier));
      if (selected.length !== topic.fieldIds.length) { setError("Não foi possível carregar todas as perguntas da revisão."); return; }
      setFields(selected); setValues(contextToInputs(selected, assessment.context));
    }).catch(() => { if (active) setError("Não foi possível carregar as perguntas da revisão."); });
    return () => { active = false; };
  }, [assessment, topic]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || !confirmed || !fields.length) return;
    setError(""); setUnchanged(false);
    try {
      setFieldErrors(schemaFieldErrors(fields, values));
      const next = readSchemaFields(fields, new Map(fields.map(({ identifier }) => [`ctx-${identifier}`, values[identifier] ?? ""])), "ctx");
      const changes = Object.fromEntries(Object.entries(next).filter(([key, value]) => assessment.context[key] !== value));
      if (!Object.keys(changes).length) { setUnchanged(true); return; }
      saving.current = true; setBusy(true);
      const saved = await guidedReview({ topic: topic.id, changes, confirmed: true, sourceAssessmentId: assessment.id });
      setResult(saved);
      window.dispatchEvent(new Event("burnoutsense-esbeu-change"));
      window.scrollTo({ top: 0 });
    } catch (caught) {
      if (caught instanceof SchemaValidationError) focusFormField(`ctx-${caught.fieldId}`);
      const failure = getError(caught);
      setError(failure.status === 409 ? "Sua rotina mudou em outra tela. Recarregue para revisar a versão mais recente."
        : failure.status >= 500 ? "O cálculo não está disponível agora. Suas alterações ainda não foram salvas."
        : failure.status === 422 && topic.id === "trabalho" ? "Confira se a jornada e a conciliação correspondem ao vínculo informado. Se não trabalha nem estagia, use 0 horas e Não se aplica." : failure.message);
    } finally { saving.current = false; setBusy(false); }
  }

  const details = result && reviewDetails(result);
  const previous = formatIndex(assessment.estimatedOverall);
  const next = result && formatIndex(result.estimatedOverall);
  return <div className="context-wizard">
    <header><p className="overline">Revisão rápida</p><h1 className="page-title">{topic.title}</h1>
      <p className="page-kicker">Atualize apenas o que mudou na sua rotina.</p></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {unchanged && <p className="context-success" role="status">Nenhuma resposta mudou. Seu contexto foi mantido e não houve um novo cálculo.</p>}
    {result ? <><p className="context-success" role="status">{previous === next ? `Revisão salva. O índice foi recalculado e o percentual exibido continua em ${next}.` : `Revisão salva. O índice foi recalculado e passou de ${previous} para ${next}.`}</p>
      {details && <section className="context-reviewed" aria-labelledby="reviewed-title"><h2 id="reviewed-title">O que foi atualizado</h2><ul>{details.reviewedFields.map((label) => <li key={label}>{label}</li>)}</ul></section>}
      <EsbeuResult record={result} /><div className="form-actions"><Link href="/dashboard" className="button">Voltar ao painel</Link><Link href="/contexto?revisao=escolher" className="button secondary">Escolher outro tema</Link></div></>
      : <form onSubmit={submit}><fieldset className="card context-step" disabled={busy}><legend>Revisar respostas</legend>
        {fields.length > 0 ? <><div className="context-fields">{fields.map((field) => <SchemaField key={field.identifier} field={field} prefix="ctx" value={values[field.identifier] ?? ""} error={fieldErrors[field.identifier]} onChange={(value) => { setValues(previous => ({ ...previous, [field.identifier]: value })); setFieldErrors(previous => { const next = { ...previous }; delete next[field.identifier]; return next; }); }} />)}</div>
          <label className="context-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Confirmo as alterações nestas respostas.</label></>
          : !error && <p role="status">Carregando perguntas…</p>}
      </fieldset><div className="form-actions"><Link href="/contexto?revisao=escolher" className="button secondary">Escolher outro tema</Link><Link href="/dashboard" className="button secondary">Voltar sem alterar</Link>
        <button type="submit" className="button" disabled={!confirmed || !fields.length || busy}>{busy ? "Calculando…" : "Atualizar meu índice"}</button></div></form>}
  </div>;
}
