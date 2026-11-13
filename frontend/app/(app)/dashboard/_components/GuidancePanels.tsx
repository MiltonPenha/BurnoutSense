"use client";

import { useEffect, useState } from "react";
import { Leaf, Lightbulb, RefreshCw } from "lucide-react";
import { getGuidance } from "@/lib/burnout-api";
import type { GuidanceResult } from "@/lib/types";
import "./GuidancePanels.css";

export function GuidancePanels({ assessmentId, loading, failed }: { assessmentId?: string; loading: boolean; failed: boolean }) {
  const [result, setResult] = useState<GuidanceResult | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!assessmentId) return;
    let active = true;
    getGuidance(assessmentId).then(value => { if (active) setResult(value); })
      .catch(() => { if (active) setError("Não foi possível carregar suas orientações agora."); });
    return () => { active = false; };
  }, [assessmentId, attempt]);
  const ready = result?.status === "ready" ? result : null;
  const unavailable = Boolean(error || result && result.status !== "ready");
  const busy = !failed && (loading || Boolean(assessmentId && !result && !error));
  const message = error || (result && result.status !== "ready" ? result.message : "");
  return <div className="dashboard-feedback guidance-panels" aria-label="Dicas e recomendações para você">
    {([{ key: "tips", title: "Dicas", Icon: Lightbulb }, { key: "recommendations", title: "Recomendações", Icon: Leaf }] as const).map(({ key, title, Icon }) => <section className="card feedback-panel" aria-labelledby={`${key}-title`} key={key} aria-busy={busy}>
      <header className="feedback-heading"><span className="feedback-icon" aria-hidden="true"><Icon size={18} /></span><h2 id={`${key}-title`}>{title}</h2></header>
      {ready ? <ul className="guidance-list">{ready[key].map(item => <li key={item.title}><h3>{item.title}</h3><p>{item.text}</p></li>)}</ul>
        : <div className="feedback-placeholder"><p>{failed ? "Orientações indisponíveis no momento." : busy ? `Preparando suas ${title.toLocaleLowerCase("pt-BR")}…` : unavailable ? "Suas orientações estarão aqui quando estiverem disponíveis." : `Suas ${title.toLocaleLowerCase("pt-BR")} aparecerão após o primeiro registro.`}</p></div>}
    </section>)}
    {unavailable && !failed && <div className="guidance-status" role="status"><p>{message}</p><button type="button" className="button secondary" onClick={() => { setResult(null); setError(""); setAttempt(value => value + 1); }}><RefreshCw size={15} aria-hidden="true" />Tentar novamente</button></div>}
    {ready && <p className="guidance-footnote">Sugestões geradas por IA a partir do seu índice. Não substituem orientação profissional.</p>}
  </div>;
}
