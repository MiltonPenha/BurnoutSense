"use client";

import { useEffect, useState } from "react";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";

export default function PerfilPage() {
  const { profile, ready, updateProfile } = useBurnoutStore();
  const [draft, setDraft] = useState(profile);

  useEffect(() => {
    if (!ready) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setDraft(profile);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [profile, ready]);

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    updateProfile(draft);
  }

  return (
    <section className="page page-narrow">
      <header className="page-header">
        <div>
          <h1 className="page-title">Perfil e configurações</h1>
          <p className="page-kicker">Gerencie seus dados e preferências.</p>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <section className="card profile-card">
          <h2 className="section-title">Dados básicos</h2>
          <div className="field" style={{ marginBottom: 18 }}>
            <label htmlFor="name">Nome</label>
            <input className="input" id="name" value={draft.name} onChange={(event) => updateField("name", event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input className="input" id="email" type="email" value={draft.email} onChange={(event) => updateField("email", event.target.value)} />
          </div>
        </section>

        <section className="card profile-card">
          <h2 className="section-title">Preferências de notificações</h2>
          <div className="settings-row">
            <div>
              <strong>Alertas por e-mail</strong>
              <div className="settings-help">Receba avisos quando seu risco aumentar</div>
            </div>
            <label className="switch" aria-label="Alertas por e-mail">
              <input checked={draft.emailAlerts} type="checkbox" onChange={(event) => updateField("emailAlerts", event.target.checked)} />
              <span className="switch-track" />
            </label>
          </div>
          <div className="settings-row">
            <div>
              <strong>Lembrete diário</strong>
              <div className="settings-help">Lembre-me de fazer o registro do dia</div>
            </div>
            <label className="switch" aria-label="Lembrete diário">
              <input checked={draft.dailyReminder} type="checkbox" onChange={(event) => updateField("dailyReminder", event.target.checked)} />
              <span className="switch-track" />
            </label>
          </div>
        </section>

        <section className="card profile-card">
          <h2 className="section-title">♡ Privacidade dos dados</h2>
          <div className="privacy-copy">
            <p>Seus registros são pessoais e usados apenas para gerar análises preventivas dentro do BurnoutSense.</p>
            <p>Os dados não são compartilhados com terceiros. Você pode solicitar a exclusão a qualquer momento.</p>
            <p>Esta plataforma é uma ferramenta de apoio e não realiza diagnóstico clínico.</p>
          </div>
        </section>

        <div className="save-row">
          <button className="button" type="submit">Salvar alterações</button>
        </div>
      </form>

      <p className="footer-note" style={{ marginTop: 60 }}>BurnoutSense é uma ferramenta de apoio preventivo e não substitui acompanhamento médico ou psicológico.</p>
    </section>
  );
}
