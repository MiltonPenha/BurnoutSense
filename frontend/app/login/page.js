"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginUser } from "@/lib/burnout-api";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: ""
  });
  const [error, setError] = useState("");

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      await loginUser(form);
      setError("");
      router.push("/dashboard");
    } catch {
      setError("Nao foi possivel entrar. Confira seus dados e tente novamente.");
    }
  }

  return (
    <section className="auth-panel">
      <div className="auth-brand">
        <span className="brand-mark">
          <Image className="brand-logo" src="/imgs/logo-BurnoutSense.svg" alt="" width={48} height={48} />
        </span>
        <div>
          <h1 className="auth-title">BurnoutSense</h1>
          <p className="auth-subtitle">Apoio preventivo para acompanhar sua rotina academica com mais leveza.</p>
        </div>
      </div>

      <form className="card auth-card auth-form" onSubmit={handleSubmit}>
        <div>
          <h2 className="section-title">Entrar na conta</h2>
          <p className="page-kicker">Acesse seu painel e continue seus registros diarios.</p>
        </div>

        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            className="input"
            id="email"
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            className="input"
            id="password"
            placeholder="Digite sua senha"
            type="password"
            value={form.password}
            onChange={(event) => updateField("password", event.target.value)}
          />
        </div>

        <div className="auth-actions">
          {error ? <p className="form-error">{error}</p> : null}
          <button className="button" type="submit">Entrar</button>
          <div className="auth-link-row">
            Ainda nao tem conta? <Link className="auth-link" href="/cadastro">Criar cadastro</Link>
          </div>
        </div>
      </form>

      <p className="auth-note">BurnoutSense e uma ferramenta de apoio preventivo e nao substitui acompanhamento medico ou psicologico.</p>
    </section>
  );
}
