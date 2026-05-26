"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerUser } from "@/lib/burnout-api";

export default function CadastroPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

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
        <span className="brand-mark">♡</span>
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
          <input
            className="input"
            id="password"
            placeholder="Crie uma senha"
            type="password"
            value={form.password}
            onChange={(event) => updateField("password", event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="confirmPassword">Confirmar senha</label>
          <input
            className="input"
            id="confirmPassword"
            placeholder="Repita a senha"
            type="password"
            value={form.confirmPassword}
            onChange={(event) => updateField("confirmPassword", event.target.value)}
          />
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
