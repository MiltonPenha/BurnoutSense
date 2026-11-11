"use client";
import "./perfil.css";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { deleteCurrentUser, sendTestNotification } from "@/lib/burnout-api";
import { useBurnoutStore } from "@/hooks/useBurnoutStore";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import type { ChangeEvent, FormEvent } from "react";
import type { Notice, Profile, Theme } from "@/lib/types";

const tabs = [
  { id: "data", label: "Dados", icon: "👤" },
  { id: "notifications", label: "Notificações", icon: "🔔" },
  { id: "preferences", label: "Preferências", icon: "⚙️" },
  { id: "privacy", label: "Privacidade", icon: "🔒" }
];

const themeOptions: { id: Theme; label: string; icon: string; help: string }[] = [
  { id: "light", label: "Claro", icon: "☀️", help: "Visual leve para uso diário." },
  { id: "dark", label: "Escuro", icon: "🌚", help: "Menos luminosidade para estudar à noite." }
];

const semesterOptions = Array.from({ length: 12 }, (_, index) => index + 1);

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "";
}

export default function PerfilPage() {
  const router = useRouter();
  const { profile, ready, error: loadError, updateProfile } = useBurnoutStore();
  const [draft, setDraft] = useState(profile);
  const [activeTab, setActiveTab] = useState("data");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [removePhotoDialogOpen, setRemovePhotoDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPreference, setSavingPreference] = useState<string | null>(null);
  const noticeTimeout = useRef<number | undefined>(undefined);
  const tabButtons = useRef<Record<string, HTMLButtonElement>>({});
  const photoInput = useRef<HTMLInputElement>(null);

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

  function showNotice(nextNotice: Notice, duration = 5000) {
    window.clearTimeout(noticeTimeout.current);
    setNotice(nextNotice);
    noticeTimeout.current = window.setTimeout(() => setNotice(null), duration);
  }

  function updateField<K extends keyof Profile>(field: K, value: Profile[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
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
      if (typeof reader.result === "string") updateField("avatarUrl", reader.result);
    };

    reader.onerror = () => {
      showNotice({ tone: "error", message: "Não foi possível carregar a imagem escolhida." });
    };

    reader.readAsDataURL(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

  function handleThemeChange(theme: Theme) {
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

    try {
      const result = await sendTestNotification({});

      showNotice({ tone: result.dailyReminder.status === "sent" ? "success" : "error", message: result.message }, 5000);
    } catch {
      showNotice({ tone: "error", message: "Não foi possível testar as notificações agora." });
    } finally {
      setSavingPreference(null);
    }
  }

  const initials = draft.name?.trim()?.slice(0, 1)?.toUpperCase() || "E";

  if (!ready || !profile.id) return <section className="page profile-page">
    <h1 className="page-title">Perfil e configurações</h1>
    {loadError ? <div role="alert"><p>{loadError}</p><button className="button secondary" type="button" onClick={() => window.location.reload()}>Tentar novamente</button></div>
      : <p role="status">Carregando seu perfil…</p>}
  </section>;

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

      <div className="profile-tabs" role="tablist" aria-label="Seções do perfil" onKeyDown={event => {
        const index = tabs.findIndex(tab => tab.id === activeTab);
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); setActiveTab(tabs[next].id); tabButtons.current[tabs[next].id]?.focus();
      }}>
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            id={`profile-${tab.id}-tab`}
            aria-controls={`profile-${tab.id}-panel`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            ref={element => { if (element) tabButtons.current[tab.id] = element; }}
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
          <section hidden={activeTab !== "data"} className="card profile-card profile-identity-card" role="tabpanel" id="profile-data-panel" aria-labelledby="profile-data-tab" tabIndex={0}>
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
                  ref={photoInput}
                  type="file"
                  onChange={handlePhotoChange}
                />
                <button id="profile-change-photo" className="button secondary tiny-button" type="button" onClick={() => photoInput.current?.click()}>Alterar foto</button>
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
          <section hidden={activeTab !== "notifications"} className="card profile-card" role="tabpanel" id="profile-notifications-panel" aria-labelledby="profile-notifications-tab" tabIndex={0}>
            <h2 className="section-title">Preferências de notificações</h2>
            <SettingsRow
              checked={draft.dailyReminder}
              help="Às 12h (horário de Brasília), se você ainda não fez o check-in de hoje."
              label="Lembrete diário"
              onChange={(value) => updateField("dailyReminder", value)}
            />
            <div className="notification-test-panel">
              <div>
                <strong>Teste de envio</strong>
                <span>Envia um e-mail real usando sua preferência salva. Salve as alterações antes de testar.</span>
              </div>
              <button className="button secondary" disabled={savingPreference === "notification-test"} type="button" onClick={handleTestNotification}>
                {savingPreference === "notification-test" ? "Testando..." : "Testar lembrete"}
              </button>
            </div>
          </section>
          <section hidden={activeTab !== "preferences"} className="card profile-card" role="tabpanel" id="profile-preferences-panel" aria-labelledby="profile-preferences-tab" tabIndex={0}>
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
          <section hidden={activeTab !== "privacy"} className="card profile-card" role="tabpanel" id="profile-privacy-panel" aria-labelledby="profile-privacy-tab" tabIndex={0}>
            <h2 className="section-title">Privacidade dos dados</h2>
            <div className="privacy-copy">
              <p>Seus registros são pessoais e usados apenas para gerar análises preventivas dentro do BurnoutSense.</p>
              <p>Para gerar dicas e recomendações, enviamos somente o percentual do seu índice ao Google Gemini, sem nome, e-mail ou respostas dos registros.</p>
              <p>Você pode excluir seus registros ou sua conta a qualquer momento.</p>
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
        <div className="save-row">
          <button className="button" disabled={savingProfile} type="submit">{savingProfile ? "Salvando..." : "Salvar alterações"}</button>
        </div>
      </form>

      <AccessibleDialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} titleId="delete-account-title" descriptionId="delete-account-description" busy={deleting}>
            <span className="alert-icon emoji-icon" aria-hidden="true">⚠️</span>
            <h2 className="confirm-title" id="delete-account-title">Excluir sua conta?</h2>
            <p className="confirm-copy" id="delete-account-description">
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
      </AccessibleDialog>

      <AccessibleDialog open={removePhotoDialogOpen} onClose={() => setRemovePhotoDialogOpen(false)} titleId="remove-photo-title" descriptionId="remove-photo-description" fallbackFocusId="profile-change-photo">
            <span className="alert-icon emoji-icon" aria-hidden="true">🖼️</span>
            <h2 className="confirm-title" id="remove-photo-title">Remover foto de perfil?</h2>
            <p className="confirm-copy" id="remove-photo-description">
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
      </AccessibleDialog>

      <p className="footer-note">BurnoutSense é uma ferramenta de apoio preventivo e não substitui acompanhamento médico ou psicológico.</p>
    </section>
  );
}

function semesterNumberFromLabel(semester?: string) {
  const match = String(semester ?? "").match(/\d+/);
  const value = match ? Number(match[0]) : "";

  if (!value || value < 1 || value > 12) {
    return "";
  }

  return String(value);
}

function semesterLabelFromNumber(value: string) {
  const number = Number(value);

  if (!number || number < 1 || number > 12) {
    return "";
  }

  return `${number}º Semestre`;
}

function SettingsRow({ checked, disabled = false, help, label, onChange }: { checked: boolean; disabled?: boolean; help: string; label: string; onChange: (value: boolean) => void }) {
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
