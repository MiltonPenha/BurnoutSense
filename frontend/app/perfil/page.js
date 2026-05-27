"use client";

import { useEffect, useState } from "react";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";

export default function PerfilPage() {
  const { profile, ready, updateProfile } = useBurnoutStore();
  const [draft, setDraft] = useState(profile);
  const [notice, setNotice] = useState("");

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

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      await updateProfile(draft);
      setNotice("Perfil atualizado com sucesso.");
      window.setTimeout(() => setNotice(""), 4000);
    } catch {
      setNotice("Nao foi possivel salvar o perfil. Tente novamente.");
      window.setTimeout(() => setNotice(""), 5000);
    }
  }

  return (
    <section className="page page-narrow">
      <header className="page-header">
        <div>
          <h1 className="page-title">Perfil e configuracoes</h1>
          <p className="page-kicker">Gerencie seus dados e preferencias.</p>
        </div>
      </header>

      {notice ? (
        <div className="inline-notice success" role="status">
          {notice}
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <section className="card profile-card">
          <h2 className="section-title">Dados basicos</h2>
          <div className="field" style={{ marginBottom: 18 }}>
            <label htmlFor="name">Nome</label>
            <input className="input" id="name" value={draft.name} onChange={(event) => updateField("name", event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input className="input" id="email" readOnly type="email" value={draft.email} />
          </div>
        </section>

        <section className="card profile-card">
          <h2 className="section-title">Preferencias de notificacoes</h2>
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
              <strong>Lembrete diario</strong>
              <div className="settings-help">Lembre-me de fazer o registro do dia</div>
            </div>
            <label className="switch" aria-label="Lembrete diario">
              <input checked={draft.dailyReminder} type="checkbox" onChange={(event) => updateField("dailyReminder", event.target.checked)} />
              <span className="switch-track" />
            </label>
          </div>
        </section>

        <section className="card profile-card">
          <h2 className="section-title">Privacidade dos dados</h2>
          <div className="privacy-copy">
            <p>Seus registros sao pessoais e usados apenas para gerar analises preventivas dentro do BurnoutSense.</p>
            <p>Os dados nao sao compartilhados com terceiros. Voce pode solicitar a exclusao a qualquer momento.</p>
            <p>Esta plataforma e uma ferramenta de apoio e nao realiza diagnostico clinico.</p>
          </div>
        </section>

        <div className="save-row">
          <button className="button" type="submit">Salvar alteracoes</button>
        </div>
      </form>

      <p className="footer-note" style={{ marginTop: 60 }}>BurnoutSense e uma ferramenta de apoio preventivo e nao substitui acompanhamento medico ou psicologico.</p>
    </section>
  );
}
