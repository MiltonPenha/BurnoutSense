"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createRecord, getEsbeuForm } from "@/lib/burnout-api";
import { readSchemaFields } from "@/lib/esbeu-form.mjs";
import { EsbeuResult } from "@/components/EsbeuResult";

const groups = { academic: "Contexto acadêmico", routine: "Rotina", demands: "Demandas acadêmicas", support: "Relações e apoio", financial: "Contexto financeiro" };

function SchemaField({ field, prefix }) {
  const id = `${prefix}-${field.identifier}`;
  return <div className="field esbeu-field">
    <label htmlFor={id}>{field.question}</label>
    {field.choices.length ? <select id={id} name={id} required defaultValue="" aria-describedby={`${id}-hint`}>
      <option value="" disabled>Selecione uma resposta</option>
      {field.choices.map((choice, index) => <option key={index} value={index}>{choice}{field.labels[index] ? ` — ${field.labels[index]}` : ""}</option>)}
      {field.allows_not_applicable && <option value="na">Não se aplica</option>}
    </select> : <input id={id} name={id} type="number" required min={field.minimum ?? undefined} max={field.maximum ?? undefined}
      step={field.data_type === "integer" ? "1" : "any"} aria-describedby={`${id}-hint`} />}
    <small id={`${id}-hint`} className="field-hint">{[field.instructions, field.unit].filter(Boolean).join(" · ")}</small>
  </div>;
}

export default function RegistroPage() {
  const [schema, setSchema] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [withItems, setWithItems] = useState(false);
  const [result, setResult] = useState(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    getEsbeuForm().then((value) => { if (active) setSchema(value); }).catch(() => {
      if (active) setLoadError("O formulário está indisponível. Verifique a conexão com os serviços e tente novamente.");
    });
    return () => { active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      const data = new FormData(event.currentTarget);
      const context = readSchemaFields(schema.fields.filter((field) => field.group !== "esbeu"), data, "ctx");
      const payload = { context, consent: data.get("consent") === "on", adult: data.get("adult") === "on",
        enrolled: data.get("enrolled") === "on", consentVersion: schema.consent.version };
      if (withItems) payload.items = readSchemaFields(schema.fields.filter((field) => field.group === "esbeu"), data, "item");
      const saved = await createRecord(payload);
      setResult(saved);
      window.dispatchEvent(new Event("burnoutsense-esbeu-change"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (failure) {
      setError(failure.status === 422 ? "Confira as respostas. Para quem apenas estuda, as horas de trabalho devem ser zero. A estimativa também pode ser recusada se estiver fora do domínio 0–4."
        : failure.status >= 500 ? "Não foi possível confirmar o registro. Consulte o histórico antes de tentar novamente. Não será gerado um resultado alternativo."
          : failure.message || "Não foi possível confirmar o registro. Consulte o histórico antes de repetir.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <section className="page esbeu-page">
    <header className="page-header"><p className="overline">Acompanhamento contextual</p><h1 className="page-title">Nova avaliação ESB-eu</h1>
      <p className="page-kicker">Considere as últimas 4 semanas. O resultado usa a escala contínua de 0 a 4, sem faixas diagnósticas.</p></header>
    {loadError && <p role="alert" className="form-error">{loadError} <button type="button" className="button secondary" onClick={() => window.location.reload()}>Tentar novamente</button></p>}
    {!schema && !loadError && <p role="status">Carregando o formulário…</p>}
    {result ? <><p role="status" className="esbeu-notice">Avaliação salva na sua conta.</p><EsbeuResult record={result} />
      <div className="form-actions"><Link className="button" href={`/historico/${result.id}`}>Ver avaliação salva</Link><Link className="button secondary" href="/dashboard">Ir ao dashboard</Link></div></>
      : schema && <form onSubmit={submit} className="esbeu-form">
        <fieldset className="card esbeu-fieldset" disabled={busy}><legend>Consentimento e elegibilidade</legend>
          <p>Suas respostas ficam vinculadas à sua conta para acompanhamento. Você pode excluí-las no histórico. Esta avaliação não é incorporada automaticamente à pesquisa ou ao treinamento.</p>
          <label className="esbeu-check"><input type="checkbox" name="adult" required /> Confirmo que tenho 18 anos ou mais.</label>
          <label className="esbeu-check"><input type="checkbox" name="enrolled" required /> Confirmo que estou matriculado(a) em um curso de graduação.</label>
          <label className="esbeu-check"><input type="checkbox" name="consent" required /> <span>{schema.consent.text}</span></label>
          <small>Consentimento de uso da aplicação · versão {schema.consent.version}. Não substitui o TCLE da pesquisa.</small>
        </fieldset>
        {Object.entries(groups).map(([group, title]) => <fieldset className="card esbeu-fieldset" key={group} disabled={busy}>
          <legend>{title}</legend><div className="form-grid">{schema.fields.filter((field) => field.group === group).map((field) => <SchemaField key={field.identifier} field={field} prefix="ctx" />)}</div>
        </fieldset>)}
        <section className="card"><h2>Medição direta opcional</h2><p>Se responder aos 14 itens, também calcularemos a ESB-eu observada. Esses itens serão armazenados nesta avaliação e não serão usados como preditores.</p>
          <label className="esbeu-check"><input type="checkbox" checked={withItems} disabled={busy} onChange={(event) => setWithItems(event.target.checked)} /> Quero responder aos 14 itens da ESB-eu.</label></section>
        {withItems && <fieldset className="card esbeu-fieldset" disabled={busy}><legend>Itens ESB-eu — últimas 4 semanas</legend>
          <div className="form-grid">{schema.fields.filter((field) => field.group === "esbeu").map((field) => <SchemaField key={field.identifier} field={field} prefix="item" />)}</div></fieldset>}
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="form-actions"><button className="button" disabled={busy} type="submit">{busy ? "Calculando e salvando…" : "Calcular e salvar avaliação"}</button>
          <Link href="/dashboard" className="button secondary">Cancelar</Link></div>
      </form>}
  </section>;
}
