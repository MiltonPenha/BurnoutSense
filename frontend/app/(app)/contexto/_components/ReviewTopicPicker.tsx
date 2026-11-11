import "./ReviewTopicPicker.css";
import Link from "next/link";
import { ArrowRight, BookOpen, BriefcaseBusiness, Check, HandHeart, ListChecks, Wallet } from "lucide-react";
import type { ReviewPlan } from "@/lib/types";

const topicIcons = { demandas: BookOpen, trabalho: BriefcaseBusiness, apoio: HandHeart, rotina: Wallet };

export function ReviewTopicPicker({ plan }: { plan: ReviewPlan }) {
  return <div className="context-wizard review-topic-picker">
    <header className="review-picker-heading"><p className="overline">Revisão rápida</p><h1 className="page-title">O que mudou na sua rotina?</h1>
      <p className="page-kicker">Escolha um tema para atualizar informações que não aparecem no check-in diário.</p></header>
    <ul className="review-topics" aria-label="Temas de revisão">
      {plan.topics.map(({ id, title, description }) => {
        const Icon = topicIcons[id];
        return <li key={id}><Link className="review-topic" href={`/contexto?revisao=${id}`}>
          <span className="review-topic-icon"><Icon size={20} aria-hidden="true" /></span>
          <span className="review-topic-copy"><strong>{title}</strong><span>{description}</span>
            {id === plan.suggested && <small>Sugestão da semana</small>}</span>
          <ArrowRight className="review-topic-arrow" size={18} aria-hidden="true" />
        </Link></li>;
      })}
    </ul>
    <div className="form-actions review-picker-actions"><Link className="button secondary" href="/dashboard"><Check size={16} aria-hidden="true" />Nada mudou</Link><Link className="button secondary" href="/contexto"><ListChecks size={16} aria-hidden="true" />Revisão completa</Link></div>
  </div>;
}
