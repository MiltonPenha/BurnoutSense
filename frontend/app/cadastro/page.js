"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerUser } from "@/lib/burnout-api";

const passwordRules = [
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

function EyeIcon({ hidden }) {
  return (
    <svg aria-hidden="true" className="password-toggle-icon" focusable="false" viewBox="0 0 24 24">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
      {hidden ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

export default function CadastroPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const passwordChecks = passwordRules.map((rule) => ({
    ...rule,
    valid: rule.test(form.password)
  }));
  const passwordIsValid = passwordChecks.every((rule) => rule.valid);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!passwordIsValid) {
      setError("A senha ainda não cumpre todos os requisitos.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("As senhas precisam ser iguais.");
      return;
    }

    try {
      await registerUser(form);
      setError("");
      router.push("/dashboard");
    } catch {
      setError("Nao foi possivel criar a conta. Tente novamente.");
    }
  }

  return (
    <section className="auth-panel">
      <div className="auth-brand">
        <span className="brand-mark">
          <Image className="brand-logo" src="/imgs/logo-BurnoutSense.svg" alt="" width={48} height={48} />
        </span>
        <div>
          <h1 className="auth-title">Criar conta</h1>
          <p className="auth-subtitle">Monte seu espaco pessoal para registrar sono, estresse, humor e rotina de estudos.</p>
        </div>
      </div>

      <form className="card auth-card auth-form" onSubmit={handleSubmit}>
        <div>
          <h2 className="section-title">Dados de acesso</h2>
          <p className="page-kicker">Use informacoes simples para iniciar o acompanhamento.</p>
        </div>

        <div className="field">
          <label htmlFor="name">Nome</label>
          <input
            className="input"
            id="name"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            className="input"
            id="email"
            placeholder="seuemail@exemplo.com"
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Senha</label>
          <div className="password-field">
            <input
              className="input"
              id="password"
              placeholder="Crie uma senha"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
            />
            <button
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="password-toggle"
              type="button"
              onClick={() => setShowPassword((current) => !current)}
            >
              <EyeIcon hidden={showPassword} />
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="confirmPassword">Confirmar senha</label>
          <div className="password-field">
            <input
              className="input"
              id="confirmPassword"
              placeholder="Repita a senha"
              type={showConfirmPassword ? "text" : "password"}
              value={form.confirmPassword}
              onChange={(event) => updateField("confirmPassword", event.target.value)}
            />
            <button
              aria-label={showConfirmPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}
              className="password-toggle"
              type="button"
              onClick={() => setShowConfirmPassword((current) => !current)}
            >
              <EyeIcon hidden={showConfirmPassword} />
            </button>
          </div>
          <ul className="password-rules" aria-label="Requisitos da senha">
            {passwordChecks.map((rule) => (
              <li className={rule.valid ? "valid" : "invalid"} key={rule.id}>
                <span aria-hidden="true">{rule.valid ? "✓" : "•"}</span>
                <span>{rule.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="auth-actions">
          {error ? <p className="form-error">{error}</p> : null}
          <button className="button" type="submit">Cadastrar</button>
          <div className="auth-link-row">
            Ja tem conta? <Link className="auth-link" href="/login">Entrar</Link>
          </div>
        </div>
      </form>
    </section>
  );
}
