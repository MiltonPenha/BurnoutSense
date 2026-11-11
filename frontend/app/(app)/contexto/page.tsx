"use client";
import type { CurrentContext, ReviewPlan } from "@/lib/types";
import "./contexto.css";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getCurrentContext, getReviewPlan } from "@/lib/burnout-api";
import { ContextWizard } from "./_components/ContextWizard";
import { GuidedReview } from "./_components/GuidedReview";
import { ReviewTopicPicker } from "./_components/ReviewTopicPicker";

function ContextoContent({ topic }: { topic: string | null }) {
  const [current, setCurrent] = useState<CurrentContext | null>(null);
  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true;
    getCurrentContext().then((value) => { if (active) setCurrent(value); }).catch(() => { if (active) setError("Não foi possível carregar sua rotina. Tente novamente."); });
    if (topic) getReviewPlan().then((value) => { if (active) setPlan(value); }).catch(() => { if (active) setError("Não foi possível carregar os temas. Tente novamente."); });
    return () => { active = false; };
  }, [topic]);
  const selected = plan?.topics.find(({ id }) => id === topic);
  return <section className="page context-page">{error ? <p className="form-error" role="alert">{error}</p> : current ?
    current.assessment && current.canReuseConsent && topic
      ? !plan ? <p role="status">Carregando temas…</p> : selected
        ? <GuidedReview assessment={current.assessment} topic={selected} /> : <ReviewTopicPicker plan={plan} />
      : <ContextWizard current={current} />
    : <p role="status">Carregando sua rotina…</p>}</section>;
}

function ContextoRoute() {
  const topic = useSearchParams().get("revisao");
  return <ContextoContent key={topic ?? "completo"} topic={topic} />;
}

export default function ContextoPage() {
  return <Suspense fallback={<p role="status">Carregando sua rotina…</p>}><ContextoRoute /></Suspense>;
}
