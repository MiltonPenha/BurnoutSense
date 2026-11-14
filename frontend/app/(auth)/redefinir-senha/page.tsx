"use client";
import "./redefinir-senha.css";

import Link from "next/link";
import Image from "next/image";
import { ShieldCheck, Link2Off } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { resetPassword } from "@/lib/burnout-api";
import { getError } from "@/lib/errors";
import { focusFormField } from "@/lib/form-focus";
import { passwordRules } from "@/lib/password-policy";
import { PasswordInput } from "../_components/PasswordInput";

export default function ResetPasswordPage() {
  const initialized = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    function readLink() {
      const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      window.history.replaceState(window.history.state, "", window.location.pathname);
      setToken(value); setInvalid(!/^[a-f0-9]{64}$/.test(value));
      setPassword(""); setConfirmPassword(""); setFields({}); setError(""); setDone(false);
    }
    if (!initialized.current) { initialized.current = true; readLink(); }
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, []);

  function change(field: string, value: string) {
    if (field === "password") setPassword(value); else setConfirmPassword(value);
    setError(""); setFields(previous => { const next = { ...previous }; delete next[field]; return next; });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !token) return;
    const errors: Record<string, string> = {};
    if (!passwordRules.every(rule => rule.test(password)) || password.length > 72) errors.password = "Complete os requisitos de senha abaixo.";
    if (!confirmPassword || confirmPassword !== password) errors.confirmPassword = "A confirmação precisa ser igual à senha.";
    setFields(errors);
    if (Object.keys(errors).length) { focusFormField(Object.keys(errors)[0]); return; }
    setSubmitting(true); setError("");
    try { await resetPassword(token, password); setPassword(""); setConfirmPassword(""); setToken(""); setDone(true); }
    catch (caught) {
      const failure = getError(caught);
      if (failure.status === 400) { setInvalid(true); setToken(""); }
      else setError(failure.status === 429 ? "Muitas tentativas. Aguarde um minuto e tente novamente."
        : "Não foi possível redefinir sua senha agora. Tente novamente em instantes.");
    } finally { setSubmitting(false); }
  }

  return <section className="auth-panel reset-password-page">
    <div className="auth-brand">
      <Image src="/imgs/logo-BurnoutSense.svg" alt="" width={48} height={48} />
      <div><h1 className="auth-title">Nova senha</h1><p className="auth-subtitle">Seu acompanhamento continua de onde você parou.</p></div>
    </div>
    {done ? <div className="card auth-card reset-status" role="status">
      <span className="reset-status-icon"><ShieldCheck size={28} aria-hidden="true" /></span>
      <h2 className="section-title">Senha redefinida</h2><p>Entre com sua nova senha. Por segurança, as sessões anteriores foram encerradas.</p>
      <Link className="button" href="/login">Entrar na conta</Link>
    </div> : invalid ? <div className="card auth-card reset-status" role="alert">
      <span className="reset-status-icon"><Link2Off size={28} aria-hidden="true" /></span>
      <h2 className="section-title">Vamos tentar com outro link?</h2><p>Este link é inválido ou expirou. Solicite um novo para recuperar seu acesso.</p>
      <Link className="button" href="/esqueci-senha">Solicitar novo link</Link>
      <Link className="auth-link" href="/login">Voltar para entrar</Link>
    </div> : token === null ? <div className="card auth-card" role="status">Preparando seu acesso...</div>
      : <form className="card auth-card auth-form" onSubmit={submit} noValidate>
        <div><h2 className="section-title">Crie sua nova senha</h2><p className="page-kicker">Escolha uma senha que você não use em outros serviços.</p></div>
        <div className="field"><label htmlFor="password">Nova senha</label>
          <PasswordInput id="password" maxLength={72} autoComplete="new-password" required value={password}
            aria-invalid={Boolean(fields.password)} aria-describedby={`reset-password-rules${fields.password ? " reset-password-error" : ""}`}
            onChange={event => change("password", event.target.value)} />
          {fields.password && <p className="field-error" id="reset-password-error">{fields.password}</p>}
        </div>
        <div className="field"><label htmlFor="confirmPassword">Confirmar nova senha</label>
          <PasswordInput id="confirmPassword" fieldName="confirmação de senha" maxLength={72} autoComplete="new-password" required value={confirmPassword}
            aria-invalid={Boolean(fields.confirmPassword)} aria-describedby={fields.confirmPassword ? "reset-confirm-error" : undefined}
            onChange={event => change("confirmPassword", event.target.value)} />
          {fields.confirmPassword && <p className="field-error" id="reset-confirm-error">{fields.confirmPassword}</p>}
          <ul className="password-rules" id="reset-password-rules" aria-label="Requisitos da senha">
            {passwordRules.map(rule => <li className={rule.test(password) ? "valid" : "invalid"} key={rule.id}>
              <span aria-hidden="true">{rule.test(password) ? "✓" : "•"}</span><span>{rule.label}</span>
            </li>)}
          </ul>
        </div>
        <div className="auth-actions">
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button" type="submit" disabled={submitting}>{submitting ? "Salvando..." : "Salvar nova senha"}</button>
          <Link className="auth-link reset-back" href="/login">Voltar para entrar</Link>
        </div>
      </form>}
  </section>;
}
