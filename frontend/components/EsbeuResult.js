import { formatEsbeu } from "@/lib/esbeu-form.mjs";

export function EsbeuResult({ record }) {
  return (
    <section className="esbeu-results" aria-label="Resultado ESB-eu">
      <article className="card esbeu-score">
        <p className="overline">Estimativa pelo contexto</p>
        <h2>ESB-eu estimada</h2>
        <p className="esbeu-score-value">{formatEsbeu(record.estimatedOverall)} <small>/ 4</small></p>
        <p>Estimativa baseada somente nas respostas contextuais. Não representa diagnóstico ou previsão futura.</p>
      </article>
      <article className="card esbeu-score">
        <p className="overline">Medição direta</p>
        <h2>ESB-eu observada</h2>
        <p className="esbeu-score-value">{record.observedOverall === null ? "Não respondida" : <>{formatEsbeu(record.observedOverall)} <small>/ 4</small></>}</p>
        <p>Calculada pela média dos 14 itens da escala. Esses itens não alimentam a estimativa contextual.</p>
        {record.observedOverall !== null && <dl className="esbeu-dimensions">
          <div><dt>Desgaste emocional e físico</dt><dd>{formatEsbeu(record.observedExhaustion)}</dd></div>
          <div><dt>Distanciamento</dt><dd>{formatEsbeu(record.observedDistancing)}</dd></div>
          <div><dt>Ineficácia da formação</dt><dd>{formatEsbeu(record.observedInefficacy)}</dd></div>
        </dl>}
      </article>
      <p className="esbeu-provenance">Modelo: {record.modelName} · Base: {record.datasetVersion} · Formulário: {record.formVersion}</p>
    </section>
  );
}
