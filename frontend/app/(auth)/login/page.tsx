"use client";
import "./login.css";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginUser } from "@/lib/burnout-api";
import { getError } from "@/lib/errors";
import type { FormEvent } from "react";
import { PasswordInput } from "../_components/PasswordInput";
import { focusFormField } from "@/lib/form-focus";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function updateField(field: keyof typeof form, value: string) {
    setError(""); setFieldErrors(previous => { const next = { ...previous }; delete next[field]; return next; });
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const fields: Record<string, string> = {};
    if (!form.email.trim() || event.currentTarget.querySelector<HTMLInputElement>('#email')?.validity.typeMismatch) fields.email = "Informe um e-mail válido.";
    if (!form.password) fields.password = "Informe sua senha.";
    setFieldErrors(fields);
    if (Object.keys(fields).length) { setError("Confira os campos destacados."); focusFormField(Object.keys(fields)[0]); return; }
    setSubmitting(true);

    try {
      await loginUser(form);
      setError("");
      router.push("/dashboard");
    } catch (caught) {
      const failure = getError(caught);
      setError(failure.status === 401 ? "E-mail ou senha incorretos. Confira os dados da sua conta."
        : failure.status === 429 ? "Muitas tentativas de acesso. Aguarde um minuto e tente novamente."
          : failure.status ? "O serviço de acesso está indisponível. Tente novamente em instantes."
            : "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-panel login-page">
      <div className="auth-brand">
        <span className="brand-mark">
          <Image className="brand-logo" src="/imgs/logo-BurnoutSense.svg" alt="" width={48} height={48} />
        </span>
        <div>
          <h1 className="auth-title">BurnoutSense</h1>
          <p className="auth-subtitle">Apoio preventivo para acompanhar sua rotina acadêmica com mais leveza.</p>
        </div>
      </div>

      <form className="card auth-card auth-form" onSubmit={handleSubmit} noValidate>
        <div>
          <h2 className="section-title">Entrar na conta</h2>
          <p className="page-kicker">Acesse seus registros e acompanhe seus índices.</p>
        </div>

        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            className="input"
            id="email"
            required
            type="email"
            autoComplete="email"
            maxLength={160}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
          />
          {fieldErrors.email && <p className="field-error" id="login-email-error">{fieldErrors.email}</p>}
        </div>

        <div className="field">
          <label htmlFor="password">Senha</label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
            placeholder="Digite sua senha"
            required
            value={form.password}
            onChange={(event) => updateField("password", event.target.value)}
          />
          {fieldErrors.password && <p className="field-error" id="login-password-error">{fieldErrors.password}</p>}
          <Link className="auth-link login-forgot-password" href="/esqueci-senha">Esqueci minha senha</Link>
        </div>

        <div className="auth-actions">
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button" disabled={submitting} type="submit">{submitting ? "Entrando..." : "Entrar"}</button>
          <div className="auth-link-row">
            Ainda não tem conta? <Link className="auth-link" href="/cadastro">Criar cadastro</Link>
          </div>
        </div>
      </form>

      <p className="auth-note">BurnoutSense é uma ferramenta de apoio preventivo e não substitui acompanhamento médico ou psicológico.</p>
    </section>
  );
}
