"use client";
import "./esqueci-senha.css";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { requestPasswordReset } from "@/lib/burnout-api";
import { getError } from "@/lib/errors";
import { focusFormField } from "@/lib/form-focus";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!email.trim() || event.currentTarget.querySelector<HTMLInputElement>("#email")?.validity.typeMismatch) {
      setEmailError("Informe um e-mail válido."); focusFormField("email"); return;
    }
    setError(""); setSubmitting(true);
    try { await requestPasswordReset(email); setSent(true); }
    catch (caught) {
      setError(getError(caught).status === 429 ? "Muitas solicitações. Aguarde um minuto e tente novamente."
        : "Não foi possível solicitar o link agora. Tente novamente em instantes.");
    } finally { setSubmitting(false); }
  }

  return <section className="auth-panel forgot-password-page">
    <div className="auth-brand">
      <Image src="/imgs/logo-BurnoutSense.svg" alt="" width={48} height={48} />
      <div><h1 className="auth-title">Recuperar acesso</h1><p className="auth-subtitle">Vamos ajudar você a voltar ao seu acompanhamento.</p></div>
    </div>
    {sent ? <div className="card auth-card recovery-sent" role="status">
      <span className="recovery-status-icon"><MailCheck size={28} aria-hidden="true" /></span>
      <h2 className="section-title">Confira seu e-mail</h2>
      <p>Se houver uma conta com esse endereço, enviaremos um link para criar uma nova senha.</p>
      <p className="page-kicker">O link vale por 30 minutos. Confira também a pasta de spam.</p>
      <Link className="button" href="/login">Voltar para entrar</Link>
      <button className="auth-link recovery-text-button" type="button" onClick={() => { setSent(false); setError(""); }}>Usar outro e-mail</button>
    </div> : <form className="card auth-card auth-form" onSubmit={submit} noValidate>
      <div><h2 className="section-title">Esqueceu sua senha?</h2><p className="page-kicker">Informe o e-mail usado no cadastro para receber o link de recuperação.</p></div>
      <div className="field">
        <label htmlFor="email">E-mail da conta</label>
        <input id="email" className="input" type="email" autoComplete="email" maxLength={160} required
          placeholder="seuemail@exemplo.com" value={email} aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? "recovery-email-error" : undefined}
          onChange={event => { setEmail(event.target.value); setEmailError(""); setError(""); }} />
        {emailError && <p className="field-error" id="recovery-email-error">{emailError}</p>}
      </div>
      <div className="auth-actions">
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={submitting}>{submitting ? "Solicitando..." : "Enviar link de recuperação"}</button>
        <Link className="auth-link recovery-back" href="/login"><ArrowLeft size={16} aria-hidden="true" /> Voltar para entrar</Link>
      </div>
    </form>}
  </section>;
}
