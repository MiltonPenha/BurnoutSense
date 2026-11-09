"use client";
import type { CurrentContext } from "@/lib/types";
import "./contexto.css";
import { useEffect, useState } from "react";
import { getCurrentContext } from "@/lib/burnout-api";
import { ContextWizard } from "./_components/ContextWizard";

export default function ContextoPage() {
  const [current, setCurrent] = useState<CurrentContext | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true;
    getCurrentContext().then((value) => { if (active) setCurrent(value); }).catch(() => { if (active) setError("Não foi possível carregar sua rotina. Tente novamente."); });
    return () => { active = false; };
  }, []);
  return <section className="page context-page">{error ? <p className="form-error" role="alert">{error}</p> : current ? <ContextWizard current={current} /> : <p role="status">Carregando sua rotina…</p>}</section>;
}
