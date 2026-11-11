"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getReviewPlan } from "@/lib/burnout-api";
import { shiftCalendarDay } from "@/lib/daily-checkin";
import type { ReviewTopic } from "@/lib/types";

export function ReviewInvite({ today, accountId }: { today: string; accountId: string }) {
  const [topic, setTopic] = useState<ReviewTopic | null>(null);
  const key = `burnoutsense.review-invitation.${accountId}`;
  useEffect(() => {
    let active = true;
    try {
      const last = localStorage.getItem(key);
      if (last && last >= shiftCalendarDay(today, -6)) return;
    } catch { return; }
    getReviewPlan().then((plan) => {
      if (active) setTopic(plan.topics.find(({ id }) => id === plan.suggested) ?? null);
    }).catch(() => {});
    return () => { active = false; };
  }, [key, today]);

  function dismiss() {
    try { localStorage.setItem(key, today); } catch { /* The invite can still be dismissed on this page. */ }
    setTopic(null);
  }

  return topic && <aside className="review-invite" aria-label="Sugestão de revisão da rotina">
    <div><strong>Que tal revisar {topic.title.toLocaleLowerCase("pt-BR")}?</strong><p>{topic.description}</p></div>
    <div className="review-invite-actions"><Link href="/contexto?revisao=escolher" className="button secondary" onClick={dismiss}>Escolher tema</Link>
      <button type="button" className="button secondary" onClick={dismiss}>Agora não</button></div>
  </aside>;
}
