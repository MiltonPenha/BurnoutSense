"use client";
import "./cadastro.css";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerUser } from "@/lib/burnout-api";
import { getError } from "@/lib/errors";
import type { FormEvent } from "react";
import { PasswordInput } from "../_components/PasswordInput";
import { focusFormField } from "@/lib/form-focus";

const passwordRules: { id: string; label: string; test: (password: string) => boolean }[] = [
  {
    id: "minLength",
    label: "Mínimo de 8 caracteres",
    test: (password) => password.length >= 8
  },
  {
    id: "uppercase",
    label: "Pelo menos 1 letra maiúscula",
    test: (password) => /[A-Z]/.test(password)
  },
  {
    id: "lowercase",
    label: "Pelo menos 1 letra minúscula",
    test: (password) => /[a-z]/.test(password)
  },
  {
    id: "number",
    label: "Pelo menos 1 número",
    test: (password) => /\d/.test(password)
  }
];

export default function CadastroPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const passwordChecks = passwordRules.map((rule) => ({
    ...rule,
    valid: rule.test(form.password)
  }));
  const passwordIsValid = passwordChecks.every((rule) => rule.valid);

  function updateField(field: keyof typeof form, value: string) {
    setError(""); setFieldErrors(previous => { const next = { ...previous }; delete next[field]; return next; });
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const fields: Record<string, string> = {};
    if (!form.name.trim()) fields.name = "Informe seu nome.";
    if (!form.email.trim() || event.currentTarget.querySelector<HTMLInputElement>('#email')?.validity.typeMismatch) fields.email = "Informe um e-mail válido.";
    if (!passwordIsValid) fields.password = "Complete os requisitos de senha indicados abaixo.";
    if (!form.confirmPassword || form.password !== form.confirmPassword) fields.confirmPassword = "A confirmação precisa ser igual à senha.";
    setFieldErrors(fields);
    if (Object.keys(fields).length) { setError("Confira os campos destacados."); focusFormField(Object.keys(fields)[0]); return; }
    setSubmitting(true);

    try {
      await registerUser(form);
      setError("");
      router.push("/dashboard");
    } catch (caught) {
      const failure = getError(caught);
      setError(failure.status === 409
        ? "Este e-mail já está cadastrado. Acesse Entrar para usar sua conta."
        : failure.status === 429
          ? "Muitas tentativas de cadastro. Aguarde um minuto antes de tentar novamente."
          : failure.status === 400
            ? "Confira nome, e-mail e senha. A senha deve ter de 8 a 72 caracteres, com letra maiúscula, minúscula e número."
            : failure.status >= 500
              ? "O serviço de cadastro está indisponível no momento. Tente novamente em instantes."
              : "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-panel cadastro-page">
      <div className="auth-brand">
        <span className="brand-mark">
          <Image className="brand-logo" src="/imgs/logo-BurnoutSense.svg" alt="" width={48} height={48} />
        </span>
        <div>
          <h1 className="auth-title">Criar conta</h1>
          <p className="auth-subtitle">Seu espaço para acompanhar a rotina e os indicadores de burnout acadêmico.</p>
        </div>
      </div>

      <form className="card auth-card auth-form" onSubmit={handleSubmit} noValidate>
        <div>
          <h2 className="section-title">Dados de acesso</h2>
          <p className="page-kicker">Use informações simples para iniciar o acompanhamento.</p>
        </div>

        <div className="field">
          <label htmlFor="name">Nome</label>
          <input
            className="input"
            id="name"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "signup-name-error" : undefined}
            maxLength={120}
            autoComplete="name"
            required
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
          />
          {fieldErrors.name && <p className="field-error" id="signup-name-error">{fieldErrors.name}</p>}
        </div>

        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            className="input"
            id="email"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "signup-email-error" : undefined}
            maxLength={160}
            autoComplete="email"
            placeholder="seuemail@exemplo.com"
            required
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
          />
          {fieldErrors.email && <p className="field-error" id="signup-email-error">{fieldErrors.email}</p>}
        </div>

        <div className="field">
          <label htmlFor="password">Senha</label>
          <PasswordInput id="password" maxLength={72} autoComplete="new-password" placeholder="Crie uma senha" required
            aria-invalid={Boolean(fieldErrors.password)} aria-describedby={`password-rules${fieldErrors.password ? " signup-password-error" : ""}`}
            value={form.password} onChange={event => updateField("password", event.target.value)} />
          {fieldErrors.password && <p className="field-error" id="signup-password-error">{fieldErrors.password}</p>}
        </div>

        <div className="field">
          <label htmlFor="confirmPassword">Confirmar senha</label>
          <PasswordInput id="confirmPassword" fieldName="confirmação de senha" maxLength={72} autoComplete="new-password" placeholder="Repita a senha" required
            aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby={fieldErrors.confirmPassword ? "signup-confirm-error" : undefined}
            value={form.confirmPassword} onChange={event => updateField("confirmPassword", event.target.value)} />
          {fieldErrors.confirmPassword && <p className="field-error" id="signup-confirm-error">{fieldErrors.confirmPassword}</p>}
          <ul className="password-rules" id="password-rules" aria-label="Requisitos da senha">
            {passwordChecks.map((rule) => (
              <li className={rule.valid ? "valid" : "invalid"} key={rule.id}>
                <span aria-hidden="true">{rule.valid ? "✓" : "•"}</span>
                <span>{rule.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="auth-actions">
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button" disabled={submitting} type="submit">{submitting ? "Cadastrando..." : "Cadastrar"}</button>
          <div className="auth-link-row">
            Já tem conta? <Link className="auth-link" href="/login">Entrar</Link>
          </div>
        </div>
      </form>
    </section>
  );
}
