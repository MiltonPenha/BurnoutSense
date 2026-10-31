import { defaultProfile, STORAGE_KEYS } from "@/lib/burnout-data";

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
    return false;
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

function requireBackend() {
  if (!hasBackend()) throw new Error("Configure a conexão com o backend para utilizar sua conta.");
}

async function request(path, options = {}) {
  requireBackend();
  const shouldAttachAuth = options.auth !== false;
  const shouldNotifySessionExpired = options.sessionExpiredOnUnauthorized !== false;
  const shouldRetryAuth = options.retryAuthOnUnauthorized !== false;
  const { auth, sessionExpiredOnUnauthorized, retryAuthOnUnauthorized, headers, ...fetchOptions } = options;

  const performRequest = () =>
    fetch(endpoint(path), {
      ...fetchOptions,
      cache: "no-store",
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
      const message = errorBody.message ?? errorBody.detail;
      if (typeof message === "string") errorMessage = message;
      else if (Array.isArray(message)) errorMessage = "Confira os campos obrigatórios, o consentimento e a elegibilidade.";
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

// Authenticated application records; no research CSV or browser data storage.
export async function getEsbeuForm() { return request("/esbeu-assessments/form"); }
export async function getEsbeuMetrics() { return request("/ai/metrics"); }
export async function getEsbeuPage(cursor, options = {}) {
  return request(`/esbeu-assessments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, {
    sessionExpiredOnUnauthorized: !options.silentUnauthorized
  });
}
export async function getRecords(options = {}) { return (await getEsbeuPage(null, options)).items; }
export async function getRecordById(id) { return request(`/esbeu-assessments/${encodeURIComponent(id)}`); }
export async function createRecord(record) {
  return request("/esbeu-assessments", { method: "POST", body: JSON.stringify(record) });
}
export async function deleteRecord(id) {
  return request(`/esbeu-assessments/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getProfile(options = {}) {
  const user = await request("/users/me", { sessionExpiredOnUnauthorized: !options.silentUnauthorized });
  return normalizeProfile(user);
}

export async function updateProfile(profile) {
  const user = await request("/users/me", {
    method: "PATCH",
    body: JSON.stringify({ name: profile.name, emailAlerts: profile.emailAlerts, dailyReminder: profile.dailyReminder,
      course: profile.course, semester: profile.semester, avatarUrl: profile.avatarUrl ?? "" })
  });
  const normalized = { ...normalizeProfile(user), theme: profile.theme ?? "light" };
  writeJson(STORAGE_KEYS.profile, normalized);
  return normalized;
}

export async function sendTestNotification(preferences) {
  return request("/notifications/test", { method: "POST", body: JSON.stringify(preferences) });
}

export async function loginUser(credentials) {
  const response = await request("/auth/login", {
    method: "POST", auth: false, sessionExpiredOnUnauthorized: false,
    body: JSON.stringify({ email: credentials.email, password: credentials.password })
  });
  return persistAuthResponse(response);
}

export async function registerUser(payload) {
  const response = await request("/auth/register", {
    method: "POST", auth: false, sessionExpiredOnUnauthorized: false,
    body: JSON.stringify({ name: payload.name, email: payload.email, password: payload.password })
  });
  return persistAuthResponse(response);
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
