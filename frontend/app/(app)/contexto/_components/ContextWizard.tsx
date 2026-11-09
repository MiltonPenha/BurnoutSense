"use client";
import "./ContextWizard.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createRecord, getEsbeuForm, getSystemStatus, reviewContext } from "@/lib/burnout-api";
import { contextToInputs, readSchemaFields } from "@/lib/esbeu-form";
import { SchemaField } from "./SchemaField";
import { EsbeuResult } from "@/components/indicators/EsbeuResult";
import { getError } from "@/lib/errors";
import type { Assessment, CurrentContext, FormField, FormSchema } from "@/lib/types";
import type { FormEvent } from "react";

const groups = [
  { id: "academic", title: "Sua vida acadêmica", text: "Vamos começar pelas informações que costumam mudar menos." },
  { id: "routine", title: "Descanso e rotina", text: "Pense em como têm sido suas últimas quatro semanas." },
  { id: "demands", title: "Demandas dos estudos", text: "Escolha a resposta que mais se aproxima do seu momento." },
  { id: "support", title: "Relações e apoio", text: "Como você tem se sentido em relação às pessoas ao seu redor?" },
  { id: "financial", title: "Seu contexto financeiro", text: "Mais uma pergunta para completar esse primeiro olhar." },
];

export function ContextWizard({ current }: { current: CurrentContext }) {
  const reviewing = Boolean(current?.assessment);
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [step, setStep] = useState(reviewing ? groups.length : 0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [confirmations, setConfirmations] = useState({ adult: false, enrolled: false, consent: false, reviewed: false });
  const [withItems, setWithItems] = useState(false);
  const [result, setResult] = useState<Assessment | null>(null);
  const saving = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    getEsbeuForm().then((form) => {
      if (active) { setSchema(form); setValues(contextToInputs(form.fields, current?.assessment?.context)); }
    }).catch(() => { if (active) setError("Não foi possível carregar as perguntas. Tente novamente em instantes."); });
    getSystemStatus().then((status) => { if (active) setAvailable(Boolean(status.model?.loaded)); })
      .catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, [current]);

  function changeStep(next: number) { setError(""); setStep(next); requestAnimationFrame(() => heading.current?.focus()); }
  function parse(fields: FormField[], prefix = "ctx") {
    return readSchemaFields(fields, new Map(fields.map((field) => [`${prefix}-${field.identifier}`, values[field.identifier] ?? ""])), prefix);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving.current || !schema) return;
    try {
      if (step < groups.length) {
        parse(schema.fields.filter((field) => field.group === groups[step].id));
        changeStep(reviewing ? groups.length : step + 1); return;
      }
      if (!confirmations.reviewed) throw new Error("Confirme que revisou suas respostas antes de continuar.");
      if (!current?.canReuseConsent && (!confirmations.adult || !confirmations.enrolled || !confirmations.consent)) throw new Error("Confirme as informações de uso antes de continuar.");
      const context = parse(schema.fields.filter((field) => field.group !== "esbeu"));
      const items = withItems ? parse(schema.fields.filter((field) => field.group === "esbeu"), "item") : undefined;
      saving.current = true; setBusy(true); setError("");
      const payload = { context, ...(items ? { items } : {}) };
      const saved = current?.canReuseConsent && current.assessment
        ? await reviewContext({ ...payload, sourceAssessmentId: current.assessment.id, confirmed: true })
        : await createRecord({ ...payload, adult: confirmations.adult, enrolled: confirmations.enrolled, consent: confirmations.consent, consentVersion: schema.consent.version });
      setResult(saved); window.dispatchEvent(new Event("burnoutsense-esbeu-change")); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      const failure = getError(caught);
      setError(failure.status === 409 ? "Seu contexto mudou em outra tela. Recarregue para revisar a versão mais recente."
        : failure.status >= 500 ? "Não foi possível confirmar seu índice. Confira o histórico antes de tentar novamente."
          : failure.status === 422 ? "Não foi possível calcular com essas respostas. Confira os campos antes de tentar novamente." : failure.message);
    } finally { saving.current = false; setBusy(false); }
  }

  if (result) return <div className="context-wizard"><p role="status" className="context-success">{reviewing ? "Sua rotina foi atualizada e seu índice foi recalculado." : "Seu primeiro índice está pronto."}</p>
    <EsbeuResult record={result} /><div className="form-actions"><Link href="/registro" className="button">Fazer check-in de hoje</Link><Link href="/dashboard" className="button secondary">Ver meu acompanhamento</Link></div></div>;
  const group = groups[step];
  return <div className="context-wizard">
    <header><p className="overline">{reviewing ? "Revisar minha rotina" : "Seu primeiro acompanhamento"}</p><h1 className="page-title">{reviewing ? "O que mudou na sua rotina?" : "Vamos conhecer seu momento"}</h1>
      <p className="page-kicker">{reviewing ? "Suas últimas respostas já estão preenchidas. Atualize somente o que mudou." : "Uma vez no início, você conta um pouco mais sobre sua rotina. Depois, seus check-ins serão rápidos."}</p></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!schema ? <p role="status">Carregando perguntas…</p> : <>
      <nav className="context-progress" aria-label="Etapas do acompanhamento"><span>Etapa {step + 1} de {groups.length + 1}</span><strong>{group?.title ?? "Revisão"}</strong><progress max={groups.length + 1} value={step + 1} /></nav>
      {available === false && <p className="context-availability" role="status">O cálculo está indisponível agora. Você pode explorar as perguntas e tentar novamente mais tarde.</p>}
      <form onSubmit={submit} noValidate>
        <section className="card context-step" aria-labelledby="context-step-title"><h2 id="context-step-title" ref={heading} tabIndex={-1}>{group?.title ?? "Tudo pronto para calcular?"}</h2>
          {group ? <><p className="page-kicker">{group.text}</p><div className="context-fields">{schema.fields.filter((field) => field.group === group.id).map((field) => <SchemaField key={field.identifier} field={field} prefix="ctx" value={values[field.identifier] ?? ""} onChange={(value) => setValues((previous) => ({ ...previous, [field.identifier]: value }))} />)}</div></>
            : <>
              <p>Estas respostas representam suas últimas quatro semanas. Você poderá voltar aqui sempre que sua rotina mudar.</p>
              <dl className="context-review-list">{groups.map((item, index) => <div key={item.id}><dt>{item.title}</dt><dd><button className="context-text-button" type="button" disabled={busy} onClick={() => changeStep(index)}>Revisar respostas</button></dd></div>)}</dl>
              {!current?.canReuseConsent && <fieldset className="context-consent"><legend>Antes de continuar</legend><details><summary>Como suas respostas serão usadas</summary><p>{schema.consent.text}</p></details>
                {[['adult', 'Confirmo que tenho 18 anos ou mais.'], ['enrolled', 'Confirmo que estou matriculado(a) em um curso de graduação.'], ['consent', 'Li e concordo com o uso das minhas respostas para meu acompanhamento.']].map(([key, label]) => <label key={key} className="context-check"><input type="checkbox" checked={confirmations[key as keyof typeof confirmations]} disabled={busy} onChange={(event) => setConfirmations((previous) => ({ ...previous, [key]: event.target.checked }))} />{label}</label>)}
              </fieldset>}
              <label className="context-check"><input type="checkbox" checked={confirmations.reviewed} disabled={busy} onChange={(event) => setConfirmations((previous) => ({ ...previous, reviewed: event.target.checked }))} />Revisei minhas respostas e confirmo que representam minha rotina recente.</label>
              <details className="context-extra"><summary>Questionário complementar opcional</summary><p>Você pode responder a mais 14 perguntas para complementar seu acompanhamento.</p>
                <label className="context-check"><input type="checkbox" checked={withItems} disabled={busy} onChange={(event) => setWithItems(event.target.checked)} />Quero responder às perguntas complementares.</label>
                {withItems && <div className="context-fields">{schema.fields.filter((field) => field.group === "esbeu").map((field) => <SchemaField key={field.identifier} field={field} prefix="item" value={values[field.identifier] ?? ""} onChange={(value) => setValues((previous) => ({ ...previous, [field.identifier]: value }))} />)}</div>}
              </details>
            </>}
        </section>
        <div className="form-actions"><button className="button secondary" type="button" disabled={busy || step === 0} onClick={() => changeStep(step - 1)}>Voltar</button>
          <button className="button" type="submit" disabled={busy || (!group && available !== true)}>{busy ? "Calculando…" : group ? reviewing ? "Voltar ao resumo" : "Continuar" : reviewing ? "Atualizar meu índice" : "Ver meu primeiro índice"}</button></div>
      </form>
    </>}
  </div>;
}
