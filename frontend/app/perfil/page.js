"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { deleteCurrentUser, sendTestNotification } from "@/lib/burnout-api";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";

const tabs = [
  { id: "data", label: "Dados", icon: "👤" },
  { id: "notifications", label: "Notificações", icon: "🔔" },
  { id: "preferences", label: "Preferências", icon: "⚙️" },
  { id: "privacy", label: "Privacidade", icon: "🔒" }
];

const themeOptions = [
  { id: "light", label: "Claro", icon: "☀️", help: "Visual leve para uso diário." },
  { id: "dark", label: "Escuro", icon: "🌚", help: "Menos luminosidade para estudar à noite." }
];

const semesterOptions = Array.from({ length: 12 }, (_, index) => index + 1);

function applyTheme(theme) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "";
}

export default function PerfilPage() {
  const router = useRouter();
  const { profile, ready, updateProfile } = useBurnoutStore();
  const [draft, setDraft] = useState(profile);
  const [activeTab, setActiveTab] = useState("data");
  const [notice, setNotice] = useState(null);
  const [notificationTest, setNotificationTest] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [removePhotoDialogOpen, setRemovePhotoDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPreference, setSavingPreference] = useState(null);
  const noticeTimeout = useRef(null);

  useEffect(() => {
    if (!ready) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setDraft(profile);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [profile, ready]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    applyTheme(profile.theme);
  }, [profile.theme, ready]);

  function showNotice(nextNotice, duration = 5000) {
    window.clearTimeout(noticeTimeout.current);
    setNotice(nextNotice);
    noticeTimeout.current = window.setTimeout(() => setNotice(null), duration);
  }

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showNotice({ tone: "error", message: "A imagem precisa ter no máximo 2MB." });
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      updateField("avatarUrl", reader.result);
    };

    reader.onerror = () => {
      showNotice({ tone: "error", message: "Não foi possível carregar a imagem escolhida." });
    };

    reader.readAsDataURL(file);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSavingProfile(true);

    try {
      await updateProfile(draft);
      showNotice({ tone: "success", message: "Perfil atualizado com sucesso." }, 4000);
    } catch {
      showNotice({ tone: "error", message: "Não foi possível salvar o perfil. Tente novamente." });
    } finally {
      setSavingProfile(false);
    }
  }

  function handleThemeChange(theme) {
    updateField("theme", theme);
  }

  async function handleDeleteAccount() {
    setDeleting(true);

    try {
      await deleteCurrentUser();
      router.replace("/login");
    } catch {
      setDeleting(false);
      setDeleteDialogOpen(false);
      showNotice({ tone: "error", message: "Não foi possível excluir a conta. Tente novamente." });
    }
  }

  async function handleTestNotification() {
    setSavingPreference("notification-test");
    setNotificationTest(null);

    try {
      const result = await sendTestNotification({
        emailAlerts: draft.emailAlerts,
        dailyReminder: draft.dailyReminder
      });

      setNotificationTest(result);
      showNotice({ tone: "success", message: "Teste de notificação executado no backend." }, 3500);
    } catch {
      showNotice({ tone: "error", message: "Não foi possível testar as notificações agora." });
    } finally {
      setSavingPreference(null);
    }
  }

  const initials = draft.name?.trim()?.slice(0, 1)?.toUpperCase() || "E";
  const emailStatus = notificationTest ? notificationStatusLabel(notificationTest.emailAlert.status) : "";
  const reminderStatus = notificationTest ? notificationStatusLabel(notificationTest.dailyReminder.status) : "";

  return (
    <section className="page profile-page">
      <header className="page-header compact-header">
        <div>
          <p className="overline">Conta e preferências</p>
          <h1 className="page-title">Perfil e configurações</h1>
          <p className="page-kicker">Gerencie seus dados, preferências e privacidade dentro do BurnoutSense.</p>
        </div>
      </header>

      {notice ? (
        <div className={`toast toast-${notice.tone}`} role="status" style={{ "--toast-duration": notice.tone === "success" ? "4s" : "5s" }}>
          <strong>{notice.tone === "success" ? "Alterações salvas" : "Atenção"}</strong>
          <span>{notice.message}</span>
        </div>
      ) : null}

      <div className="profile-tabs" role="tablist" aria-label="Seções do perfil">
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "active" : ""}
            key={tab.id}
            role="tab"
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-emoji emoji-icon" aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {activeTab === "data" ? (
          <section className="card profile-card profile-identity-card">
            <h2 className="section-title">Dados básicos</h2>
            <div className="profile-avatar-row">
              <span className="profile-avatar">
                {draft.avatarUrl ? <Image className="profile-avatar-image" src={draft.avatarUrl} alt="" width={72} height={72} unoptimized /> : initials}
              </span>
              <div className="profile-photo-actions">
                <input
                  accept="image/png,image/jpeg,image/gif"
                  className="hidden-file-input"
                  id="profile-photo"
                  type="file"
                  onChange={handlePhotoChange}
                />
                <label className="button secondary tiny-button" htmlFor="profile-photo">Alterar foto</label>
                {draft.avatarUrl ? (
                  <button className="button secondary tiny-button" type="button" onClick={() => setRemovePhotoDialogOpen(true)}>
                    Remover
                  </button>
                ) : null}
                <small>JPG, PNG ou GIF. Máximo 2MB.</small>
              </div>
            </div>

            <div className="field">
              <label htmlFor="name">Nome</label>
              <input className="input" id="name" value={draft.name} onChange={(event) => updateField("name", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input className="input" id="email" readOnly type="email" value={draft.email} />
            </div>
            <div className="field">
              <label htmlFor="course">Curso</label>
              <input className="input" id="course" value={draft.course ?? ""} onChange={(event) => updateField("course", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="semester">Período</label>
              <span className="select-control">
                <select
                  className="input"
                  id="semester"
                  value={semesterNumberFromLabel(draft.semester)}
                  onChange={(event) => updateField("semester", semesterLabelFromNumber(event.target.value))}
                >
                  <option value="">Selecione o semestre</option>
                  {semesterOptions.map((semester) => (
                    <option key={semester} value={semester}>
                      {semester}º Semestre
                    </option>
                  ))}
                </select>
                <span className="select-arrow" aria-hidden="true">›</span>
              </span>
            </div>
          </section>
        ) : null}

        {activeTab === "notifications" ? (
          <section className="card profile-card">
            <h2 className="section-title">Preferências de notificações</h2>
            <SettingsRow
              checked={draft.emailAlerts}
              help="Receba avisos quando seu risco aumentar"
              label="Alertas por e-mail"
              onChange={(value) => updateField("emailAlerts", value)}
            />
            <SettingsRow
              checked={draft.dailyReminder}
              help="Lembre-me de fazer o registro do dia"
              label="Lembrete diário"
              onChange={(value) => updateField("dailyReminder", value)}
            />
            <div className="notification-test-panel">
              <div>
                <strong>Teste de envio</strong>
                <span>Executa uma simulação no backend usando as opções selecionadas acima.</span>
              </div>
              <button className="button secondary" disabled={savingPreference === "notification-test"} type="button" onClick={handleTestNotification}>
                {savingPreference === "notification-test" ? "Testando..." : "Testar notificações"}
              </button>
            </div>
            {notificationTest ? (
              <div className="notification-test-result" role="status">
                <strong>{notificationTest.message}</strong>
                <span>E-mail: {emailStatus} · Lembrete: {reminderStatus}</span>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "preferences" ? (
          <section className="card profile-card">
            <h2 className="section-title">Preferências de uso</h2>
            <div className="theme-panel">
              <div>
                <strong>Tema da interface</strong>
                <span>Escolha o visual mais confortável para acompanhar seus registros.</span>
              </div>
              <div className="theme-options" role="group" aria-label="Tema da interface">
                {themeOptions.map((option) => (
                  <button
                    aria-pressed={(draft.theme ?? "light") === option.id}
                    className={(draft.theme ?? "light") === option.id ? "active" : ""}
                    disabled={savingPreference === "theme"}
                    key={option.id}
                    type="button"
                    onClick={() => handleThemeChange(option.id)}
                  >
                    <span className="tab-emoji emoji-icon" aria-hidden="true">{option.icon}</span>
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.help}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>

          </section>
        ) : null}

        {activeTab === "privacy" ? (
          <section className="card profile-card">
            <h2 className="section-title">Privacidade dos dados</h2>
            <div className="privacy-copy">
              <p>Seus registros são pessoais e usados apenas para gerar análises preventivas dentro do BurnoutSense.</p>
              <p>Os dados não são compartilhados com terceiros. Você pode solicitar a exclusão a qualquer momento.</p>
              <p>Esta plataforma é uma ferramenta de apoio e não realiza diagnóstico clínico.</p>
            </div>

            <div className="privacy-danger-zone">
              <div>
                <strong>Excluir conta</strong>
                <span>Remove seu acesso e os dados vinculados ao seu perfil. Essa ação precisa de confirmação.</span>
              </div>
              <button className="button danger" type="button" onClick={() => setDeleteDialogOpen(true)}>
                Excluir minha conta
              </button>
            </div>
          </section>
        ) : null}

        <div className="save-row">
          <button className="button" disabled={savingProfile} type="submit">{savingProfile ? "Salvando..." : "Salvar alterações"}</button>
        </div>
      </form>

      {deleteDialogOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
            <span className="alert-icon emoji-icon" aria-hidden="true">⚠️</span>
            <h2 className="confirm-title" id="delete-account-title">Excluir sua conta?</h2>
            <p className="confirm-copy">
              Essa ação removerá sua conta e encerrará a sessão atual. Confirme apenas se tiver certeza.
            </p>
            <div className="confirm-actions">
              <button className="button secondary" type="button" disabled={deleting} onClick={() => setDeleteDialogOpen(false)}>
                Fechar
              </button>
              <button className="button danger" type="button" disabled={deleting} onClick={handleDeleteAccount}>
                {deleting ? "Excluindo..." : "Confirmar exclusão"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removePhotoDialogOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-photo-title">
            <span className="alert-icon emoji-icon" aria-hidden="true">🖼️</span>
            <h2 className="confirm-title" id="remove-photo-title">Remover foto de perfil?</h2>
            <p className="confirm-copy">
              A imagem atual será removida do seu perfil após salvar as alterações. Você poderá escolher outra foto quando quiser.
            </p>
            <div className="confirm-actions">
              <button className="button secondary" type="button" onClick={() => setRemovePhotoDialogOpen(false)}>
                Cancelar
              </button>
              <button
                className="button danger"
                type="button"
                onClick={() => {
                  updateField("avatarUrl", "");
                  setRemovePhotoDialogOpen(false);
                }}
              >
                Remover foto
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <p className="footer-note">BurnoutSense é uma ferramenta de apoio preventivo e não substitui acompanhamento médico ou psicológico.</p>
    </section>
  );
}

function notificationStatusLabel(status) {
  const labels = {
    sent: "enviado",
    failed: "falhou",
    skipped: "desativado",
    not_configured: "SMTP não configurado",
    simulated: "simulado"
  };

  return labels[status] ?? status;
}

function semesterNumberFromLabel(semester) {
  const match = String(semester ?? "").match(/\d+/);
  const value = match ? Number(match[0]) : "";

  if (!value || value < 1 || value > 12) {
    return "";
  }

  return String(value);
}

function semesterLabelFromNumber(value) {
  const number = Number(value);

  if (!number || number < 1 || number > 12) {
    return "";
  }

  return `${number}º Semestre`;
}

function SettingsRow({ checked, disabled = false, help, label, onChange }) {
  return (
    <div className="settings-row">
      <div>
        <strong>{label}</strong>
        <div className="settings-help">{help}</div>
      </div>
      <label className="switch" aria-label={label}>
        <input checked={checked} disabled={disabled} type="checkbox" onChange={(event) => onChange(event.target.checked)} />
        <span className="switch-track" />
      </label>
    </div>
  );
}
