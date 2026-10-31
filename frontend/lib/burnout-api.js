import { defaultProfile, defaultRecords, STORAGE_KEYS } from "@/lib/burnout-data";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const AUTH_KEYS = {
  accessToken: "burnoutsense.auth.accessToken",
  refreshToken: "burnoutsense.auth.refreshToken",
  activeSession: "burnoutsense.auth.activeSession"
};

export const SESSION_TIMEOUT_MINUTES = 30;

function hasBackend() {
  return Boolean(API_URL);
}

function endpoint(path) {
  return `${API_URL}${path}`;
}

function readJson(key, fallback) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

function readToken(key) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(key);
}

function writeToken(key, value) {
  if (typeof window !== "undefined" && value) {
    window.localStorage.setItem(key, value);
  }
}

function markActiveBrowserSession() {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(AUTH_KEYS.activeSession, "true");
  }
}

function hasActiveBrowserSession() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.sessionStorage.getItem(AUTH_KEYS.activeSession) === "true";
}

function clearActiveBrowserSession() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(AUTH_KEYS.activeSession);
  }
}

function notifyAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("burnoutsense-auth-change"));
  }
}

function notifySessionExpired(reason = "expired") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("burnoutsense-session-ended", { detail: { reason } }));
  }
}

function clearAuthTokens(reason, options = {}) {
  const shouldShowMessage = options.showMessage ?? Boolean(reason);

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(AUTH_KEYS.accessToken);
    window.localStorage.removeItem(AUTH_KEYS.refreshToken);
    clearActiveBrowserSession();
    if (reason && shouldShowMessage) {
      notifySessionExpired(reason);
    }
    notifyAuthChange();
  }
}

function persistAuthResponse(authResponse) {
  writeToken(AUTH_KEYS.accessToken, authResponse.accessToken);
  writeToken(AUTH_KEYS.refreshToken, authResponse.refreshToken);
  markActiveBrowserSession();

  if (authResponse.user) {
    writeJson(STORAGE_KEYS.profile, normalizeProfile(authResponse.user));
  }

  notifyAuthChange();

  return authResponse;
}

function authHeaders() {
  const accessToken = readToken(AUTH_KEYS.accessToken);

  if (!accessToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${accessToken}`
  };
}

export function isAuthenticated() {
  if (!hasBackend()) {
    return true;
  }

  return Boolean(readToken(AUTH_KEYS.accessToken));
}

async function refreshAuthToken() {
  const refreshToken = readToken(AUTH_KEYS.refreshToken);

  if (!refreshToken) {
    return false;
  }

  const response = await fetch(endpoint("/auth/refresh"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refreshToken })
  }).catch(() => null);

  if (!response?.ok) {
    return false;
  }

  const authResponse = await response.json();
  persistAuthResponse(authResponse);
  return true;
}

async function request(path, options = {}) {
  const shouldAttachAuth = options.auth !== false;
  const shouldNotifySessionExpired = options.sessionExpiredOnUnauthorized !== false;
  const shouldRetryAuth = options.retryAuthOnUnauthorized !== false;
  const { auth, sessionExpiredOnUnauthorized, retryAuthOnUnauthorized, headers, ...fetchOptions } = options;

  const performRequest = () =>
    fetch(endpoint(path), {
      ...fetchOptions,
      headers: {
        "Content-Type": "application/json",
        ...(shouldAttachAuth ? authHeaders() : {}),
        ...headers
      }
    });

  let response = await performRequest();

  if (response.status === 401 && shouldAttachAuth && shouldRetryAuth) {
    const refreshed = await refreshAuthToken();

    if (refreshed) {
      response = await performRequest();
    }
  }

  if (response.status === 401 && shouldAttachAuth) {
    clearAuthTokens("expired", {
      showMessage: shouldNotifySessionExpired && hasActiveBrowserSession()
    });
  }

  if (!response.ok) {
    let errorMessage = `Request failed: ${response.status}`;

    try {
      const errorBody = await response.json();
      errorMessage = errorBody.message ?? errorBody.detail ?? errorMessage;
    } catch {
      // Keep the generic status message when the backend does not return JSON.
    }

    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function normalizeProfile(user) {
  const localProfile = readJson(STORAGE_KEYS.profile, defaultProfile);
  const shouldUseLocalProfile = localProfile.id === user.id;
  const accountProfile = shouldUseLocalProfile ? localProfile : defaultProfile;
  const userHasField = (field) => Object.prototype.hasOwnProperty.call(user, field);

  return {
    ...defaultProfile,
    ...accountProfile,
    id: user.id,
    name: user.name ?? accountProfile.name,
    email: user.email ?? accountProfile.email,
    course: normalizeCourse(userHasField("course") ? user.course : accountProfile.course),
    semester: normalizeSemester(userHasField("semester") ? user.semester : accountProfile.semester),
    avatarUrl: userHasField("avatarUrl") ? user.avatarUrl ?? "" : accountProfile.avatarUrl ?? "",
    emailAlerts: user.emailAlerts ?? accountProfile.emailAlerts,
    dailyReminder: user.dailyReminder ?? accountProfile.dailyReminder,
    theme: accountProfile.theme ?? "light"
  };
}

function normalizeCourse(course) {
  return course ?? "";
}

function normalizeSemester(semester) {
  return semester ?? "";
}

// The previous assessment representation is retired. New ESB-eu UI/persistence
// integration is explicit; there is no local prediction or fabricated fallback.
export async function getRecords() { return [...defaultRecords]; }
export async function getRecordById() { return null; }
export async function createRecord() { throw new Error("Integração do formulário ESB-eu pendente."); }
export async function updateRecord() { throw new Error("Integração do formulário ESB-eu pendente."); }
export async function deleteRecord() { throw new Error("Integração do histórico ESB-eu pendente."); }

export async function getProfile(options = {}) {
  if (hasBackend()) {
    const user = await request("/users/me", {
      sessionExpiredOnUnauthorized: !options.silentUnauthorized
    });
    return normalizeProfile(user);
  }

  return readJson(STORAGE_KEYS.profile, defaultProfile);
}

export async function updateProfile(profile) {
  if (hasBackend()) {
    const user = await request("/users/me", {
      method: "PATCH",
      body: JSON.stringify({
        name: profile.name,
        emailAlerts: profile.emailAlerts,
        dailyReminder: profile.dailyReminder,
        course: profile.course,
        semester: profile.semester,
        avatarUrl: profile.avatarUrl ?? ""
      })
    });
    const normalizedProfile = {
      ...normalizeProfile(user),
      theme: profile.theme ?? "light"
    };

    writeJson(STORAGE_KEYS.profile, normalizedProfile);
    return normalizedProfile;
  }

  writeJson(STORAGE_KEYS.profile, profile);
  return profile;
}

export async function sendTestNotification(preferences) {
  if (hasBackend()) {
    return request("/notifications/test", {
      method: "POST",
      body: JSON.stringify(preferences)
    });
  }

  const emailEnabled = preferences.emailAlerts !== false;
  const reminderEnabled = preferences.dailyReminder !== false;

  return {
    deliveryMode: "local-simulation",
    emailAlert: { status: emailEnabled ? "simulated" : "skipped" },
    dailyReminder: { status: reminderEnabled ? "simulated" : "skipped" },
    message: emailEnabled || reminderEnabled ? "Notificação simulada localmente." : "Nenhuma notificação ativa para testar."
  };
}

export async function loginUser(credentials) {
  if (hasBackend()) {
    const authResponse = await request("/auth/login", {
      method: "POST",
      auth: false,
      sessionExpiredOnUnauthorized: false,
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password
      })
    });

    return persistAuthResponse(authResponse);
  }

  return { user: readJson(STORAGE_KEYS.profile, defaultProfile), accessToken: "local-demo-token" };
}

export async function registerUser(payload) {
  if (hasBackend()) {
    const authResponse = await request("/auth/register", {
      method: "POST",
      auth: false,
      sessionExpiredOnUnauthorized: false,
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        password: payload.password
      })
    });

    return persistAuthResponse(authResponse);
  }

  const profile = {
    ...defaultProfile,
    name: payload.name || "estudante",
    email: payload.email
  };
  writeJson(STORAGE_KEYS.profile, profile);
  return { user: profile, accessToken: "local-demo-token" };
}

export async function logoutUser() {
  try {
    if (hasBackend()) {
      const refreshToken = readToken(AUTH_KEYS.refreshToken);
      const body = refreshToken ? { refreshToken } : {};

      await request("/auth/logout", {
        method: "POST",
        retryAuthOnUnauthorized: false,
        sessionExpiredOnUnauthorized: false,
        body: JSON.stringify(body)
      });
    }
  } finally {
    clearAuthTokens();
  }
}

export async function deleteCurrentUser() {
  try {
    if (hasBackend()) {
      await request("/users/me", {
        method: "DELETE"
      });
    }
  } finally {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEYS.profile);
      window.localStorage.removeItem(STORAGE_KEYS.records);
    }
    clearAuthTokens();
  }
}

export async function getSystemStatus() {
  if (!hasBackend()) {
    return {
      backend: { status: "offline" },
      database: { status: "offline" },
      aiService: { status: "offline" },
      model: { loaded: false, status: "unavailable" },
      checkedAt: new Date().toISOString()
    };
  }

  return request("/status", {
    headers: {}
  });
}

export function endSession(reason = "expired") {
  clearAuthTokens(reason);
}
