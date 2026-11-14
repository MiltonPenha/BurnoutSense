import { defaultProfile, STORAGE_KEYS } from "@/lib/burnout-data";
import { ApiError } from "./errors";
import type { GuidanceResult } from "./types";
import { createSessionReadCache } from "./session-read-cache";
import { clearSessionDrafts } from "./session-draft";
import type { AccountProfile, Assessment, AssessmentDetail, AuthResponse, CreateAssessment, CurrentContext, DailyCheckIn, DailyDay, DailyOverview, FormSchema, IndexUpdate, PageResult, Profile, ReviewContext, ReviewPlan, ReviewTopicId, SaveDailyCheckIn, SavedDailyCheckIn, SystemStatus, TrendRecord } from "./types";

type LoadOptions = { silentUnauthorized?: boolean };

export function getGuidance(assessmentId: string) {
  return request<GuidanceResult>(`/guidance/${encodeURIComponent(assessmentId)}`);
}
type RequestOptions = Omit<RequestInit, "headers"> & { auth?: boolean; sessionExpiredOnUnauthorized?: boolean; retryAuthOnUnauthorized?: boolean; headers?: Record<string, string> };

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const readCache = createSessionReadCache();

const AUTH_KEYS = { activeSession: "burnoutsense.auth.activeSession", event: "burnoutsense.auth.event", pendingLogout: "burnoutsense.auth.pendingLogout" };
let sessionUser: AccountProfile | null = null;
let sessionGeneration = 0;
let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;
let sessionRequest: Promise<boolean> | null = null;

export const SESSION_TIMEOUT_MINUTES = 30;

function hasBackend() {
  return Boolean(API_URL);
}

function endpoint(path: string) {
  return `${API_URL}${path}`;
}

function readJson<T>(key: string, fallback: T): T {
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

function writeJson(key: string, value: unknown) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

function purgeLegacyTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("burnoutsense.auth.accessToken");
  window.localStorage.removeItem("burnoutsense.auth.refreshToken");
}

function broadcastSessionChange() {
  if (typeof window !== "undefined") window.localStorage.setItem(AUTH_KEYS.event, String(Date.now()) + Math.random());
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

function clearAuthTokens(reason?: string, options: { showMessage?: boolean } = {}) {
  readCache.clear(); clearSessionDrafts();
  sessionUser = null; csrfToken = null; sessionGeneration++;
  const shouldShowMessage = options.showMessage ?? Boolean(reason);

  if (typeof window !== "undefined") {
    purgeLegacyTokens();
    clearActiveBrowserSession();
    if (reason && shouldShowMessage) {
      notifySessionExpired(reason);
    }
    notifyAuthChange();
  }
}

function persistAuthResponse(authResponse: AuthResponse) {
  readCache.clear();
  if (sessionUser?.id !== authResponse.user.id) {
    if (sessionUser) clearSessionDrafts();
    sessionGeneration++;
  }
  sessionUser = authResponse.user;
  if (authResponse.csrfToken) csrfToken = authResponse.csrfToken;
  purgeLegacyTokens();
  markActiveBrowserSession();

  if (authResponse.user) {
    writeJson(STORAGE_KEYS.profile, normalizeProfile(authResponse.user));
  }

  notifyAuthChange();

  return authResponse;
}

export function isAuthenticated() {
  return hasBackend() && Boolean(sessionUser);
}

// UI state isolation only. Authorization is always checked by the backend.
export function sessionAccountKey() {
  return sessionUser?.id ?? "anonymous";
}

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  csrfRequest ??= fetch(endpoint("/auth/csrf"), { credentials: "include", cache: "no-store" })
    .then(async response => {
      if (!response.ok) throw new ApiError("Não foi possível preparar sua sessão.", response.status);
      const body: { csrfToken: string } = await response.json();
      csrfToken = body.csrfToken; return body.csrfToken;
    }).finally(() => { csrfRequest = null; });
  return csrfRequest;
}

async function sessionFetch(path: string, options: RequestInit = {}) {
  const mutation = !["GET", "HEAD", "OPTIONS"].includes((options.method ?? "GET").toUpperCase());
  const send = async () => fetch(endpoint(path), { ...options, credentials: "include", cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers, ...(mutation ? { "X-CSRF-Token": await getCsrfToken() } : {}) } });
  let response = await send();
  if (mutation && response.status === 403 && (await response.clone().json().catch(() => null))?.code === "CSRF_INVALID") {
    csrfToken = null; response = await send();
  }
  return response;
}

async function restoreAuthResponse(response: Response, generation: number) {
  const body: AuthResponse = await response.json();
  if (generation !== sessionGeneration) return isAuthenticated();
  persistAuthResponse(body);
  return true;
}

export function restoreSession(): Promise<boolean> {
  requireBackend(); purgeLegacyTokens();
  sessionRequest ??= (async () => {
    if (typeof window !== "undefined" && window.localStorage.getItem(AUTH_KEYS.pendingLogout)) await logoutUser();
    const generation = sessionGeneration;
    const response = await sessionFetch("/auth/session");
    if (generation !== sessionGeneration) return isAuthenticated();
    if (response.ok) return restoreAuthResponse(response, generation);
    if (response.status === 401) {
      const restored = await refreshAuthToken();
      if (!restored) clearAuthTokens();
      return restored;
    }
    throw new ApiError("Não foi possível verificar sua sessão. Tente novamente.", response.status);
  })().finally(() => { sessionRequest = null; });
  return sessionRequest;
}

let refreshing: Promise<boolean> | null = null;
function refreshAuthToken() {
  refreshing ??= performRefresh().finally(() => { refreshing = null; });
  return refreshing;
}

async function performRefresh() {
  const renew = async () => {
    const generation = sessionGeneration;
    // A different tab may already have renewed the shared cookie while we waited.
    const active = await sessionFetch("/auth/session");
    if (generation !== sessionGeneration) return isAuthenticated();
    if (active.ok) return restoreAuthResponse(active, generation);
    if (active.status !== 401) throw new ApiError("Não foi possível renovar sua sessão.", active.status);
    const response = await sessionFetch("/auth/refresh", { method: "POST" });
    if (generation !== sessionGeneration) return isAuthenticated();
    if (response.status === 401) return false;
    if (response.status === 409) {
      const retry = await sessionFetch("/auth/session");
      if (!retry.ok) return false;
      return restoreAuthResponse(retry, generation);
    }
    if (!response.ok) throw new ApiError("Não foi possível renovar sua sessão.", response.status);
    return restoreAuthResponse(response, generation);
  };
  return typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request("burnoutsense-session-refresh", renew) : renew();
}

function requireBackend() {
  if (!hasBackend()) throw new Error("Configure a conexão com o backend para utilizar sua conta.");
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  if (method === "GET" && options.auth !== false && sessionUser) {
    return readCache.read(`${sessionUser.id}:${sessionGeneration}:${path}:${options.sessionExpiredOnUnauthorized !== false}`, () => performApiRequest<T>(path, options));
  }
  if (method !== "GET") readCache.clear();
  try { return await performApiRequest<T>(path, options); }
  finally { if (method !== "GET") readCache.clear(); }
}

async function performApiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  requireBackend();
  const { auth = true, sessionExpiredOnUnauthorized = true, retryAuthOnUnauthorized = true, headers, ...fetchOptions } = options;
  const shouldAttachAuth = auth;
  const shouldNotifySessionExpired = sessionExpiredOnUnauthorized;
  const shouldRetryAuth = retryAuthOnUnauthorized;

  const performRequest = () =>
    sessionFetch(path, {
      ...fetchOptions,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
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

    throw new ApiError(errorMessage, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

function normalizeProfile(user: AccountProfile): Profile {
  const localProfile = readJson(STORAGE_KEYS.profile, defaultProfile);
  const shouldUseLocalProfile = localProfile.id === user.id;
  const accountProfile = shouldUseLocalProfile ? localProfile : defaultProfile;
  const userHasField = (field: keyof AccountProfile) => Object.prototype.hasOwnProperty.call(user, field);

  return {
    ...defaultProfile,
    ...accountProfile,
    id: user.id,
    name: user.name ?? accountProfile.name,
    email: user.email ?? accountProfile.email,
    course: normalizeCourse(userHasField("course") ? user.course : accountProfile.course),
    semester: normalizeSemester(userHasField("semester") ? user.semester : accountProfile.semester),
    avatarUrl: userHasField("avatarUrl") ? user.avatarUrl ?? "" : accountProfile.avatarUrl ?? "",
    dailyReminder: user.dailyReminder ?? accountProfile.dailyReminder,
    theme: accountProfile.theme ?? "light"
  };
}

function normalizeCourse(course?: string | null) {
  return course ?? "";
}

function normalizeSemester(semester?: string | null) {
  return semester ?? "";
}

// Authenticated application records; no research CSV or browser data storage.
export async function getEsbeuForm() { return request<FormSchema>("/esbeu-assessments/form"); }
export async function getCurrentContext() { return request<CurrentContext>("/esbeu-assessments/current"); }
export async function getDailyDay(date: string) { return request<DailyDay>(`/daily-check-ins/day/${encodeURIComponent(date)}`); }
export async function saveDailyCheckIn(payload: SaveDailyCheckIn) { return request<SavedDailyCheckIn>("/daily-check-ins", { method: "PUT", body: JSON.stringify(payload) }); }
export async function recalculateDailyIndex() { return request<IndexUpdate>("/daily-check-ins/recalculate", { method: "POST" }); }
export async function reviewContext(payload: ReviewContext) { return request<Assessment>("/esbeu-assessments/review", { method: "POST", body: JSON.stringify(payload) }); }
export async function getReviewPlan() { return request<ReviewPlan>("/esbeu-assessments/review-topics"); }
export async function guidedReview(payload: { topic: ReviewTopicId; sourceAssessmentId: string; confirmed: true; changes: ReviewContext["context"] }) {
  return request<Assessment>("/esbeu-assessments/guided-review", { method: "POST", body: JSON.stringify(payload) });
}
export async function getDailyOverview() { return request<DailyOverview>("/daily-check-ins/overview"); }
export async function getDailyPage(cursor?: string | null) { return request<PageResult<DailyCheckIn>>(`/daily-check-ins${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`); }
export async function deleteDailyCheckIn(id: string) { return request<{ indexUpdate: IndexUpdate }>(`/daily-check-ins/${encodeURIComponent(id)}`, { method: "DELETE" }); }
export async function getEsbeuPage(cursor?: string | null, options: LoadOptions = {}) {
  return request<PageResult<Assessment>>(`/esbeu-assessments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, {
    sessionExpiredOnUnauthorized: !options.silentUnauthorized
  });
}
export async function getRecords(options: LoadOptions = {}) { return (await getEsbeuPage(null, options)).items; }
export async function getAssessmentTrend() { return request<TrendRecord[]>("/esbeu-assessments/trend"); }
export async function getRecordById(id: string) { return request<AssessmentDetail>(`/esbeu-assessments/${encodeURIComponent(id)}`); }
export async function createRecord(record: CreateAssessment) {
  return request<Assessment>("/esbeu-assessments", { method: "POST", body: JSON.stringify(record) });
}
export async function deleteRecord(id: string) {
  return request<void>(`/esbeu-assessments/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getProfile(options: LoadOptions = {}) {
  const user = await request<AccountProfile>("/users/me", { sessionExpiredOnUnauthorized: !options.silentUnauthorized });
  return normalizeProfile(user);
}

export async function updateProfile(profile: Profile) {
  const user = await request<AccountProfile>("/users/me", {
    method: "PATCH",
    body: JSON.stringify({ name: profile.name, dailyReminder: profile.dailyReminder,
      course: profile.course, semester: profile.semester, avatarUrl: profile.avatarUrl ?? "" })
  });
  const normalized = { ...normalizeProfile(user), theme: profile.theme ?? "light" };
  writeJson(STORAGE_KEYS.profile, normalized);
  return normalized;
}

export async function loginUser(credentials: { email: string; password: string }) {
  const response = await request<AuthResponse>("/auth/login", {
    method: "POST", auth: false, sessionExpiredOnUnauthorized: false,
    body: JSON.stringify({ email: credentials.email.trim().toLowerCase(), password: credentials.password })
  });
  clearSessionDrafts(); const result = persistAuthResponse(response); broadcastSessionChange(); return result;
}

export function requestPasswordReset(email: string) {
  return request<{ message: string }>("/auth/forgot-password", {
    method: "POST", auth: false, sessionExpiredOnUnauthorized: false, retryAuthOnUnauthorized: false,
    body: JSON.stringify({ email: email.trim().toLowerCase() })
  });
}

export async function resetPassword(token: string, password: string) {
  const result = await request<{ message: string }>("/auth/reset-password", {
    method: "POST", auth: false, sessionExpiredOnUnauthorized: false, retryAuthOnUnauthorized: false,
    body: JSON.stringify({ token, password })
  });
  clearAuthTokens(); broadcastSessionChange();
  return result;
}

export async function registerUser(payload: { name: string; email: string; password: string }) {
  const response = await request<AuthResponse>("/auth/register", {
    method: "POST", auth: false, sessionExpiredOnUnauthorized: false,
    body: JSON.stringify({ name: payload.name.trim(), email: payload.email.trim().toLowerCase(), password: payload.password })
  });
  clearSessionDrafts(); const result = persistAuthResponse(response); broadcastSessionChange(); return result;
}

export async function logoutUser(reason?: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(AUTH_KEYS.pendingLogout, "true");
  try {
    if (hasBackend()) {
      await request("/auth/logout", {
        method: "POST",
        auth: false,
        retryAuthOnUnauthorized: false,
        sessionExpiredOnUnauthorized: false,
      });
    }
    if (typeof window !== "undefined") window.localStorage.removeItem(AUTH_KEYS.pendingLogout);
  } finally {
    clearAuthTokens(reason); broadcastSessionChange();
  }
}

export async function deleteCurrentUser() {
  await request("/users/me", { method: "DELETE" });
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEYS.profile);
    window.localStorage.removeItem(STORAGE_KEYS.records);
  }
  clearAuthTokens(); broadcastSessionChange();
}

export async function getSystemStatus(): Promise<SystemStatus> {
  if (!hasBackend()) {
    return {
      backend: { status: "offline" },
      database: { status: "offline" },
      aiService: { status: "offline" },
      model: { loaded: false, status: "unavailable" },
      checkedAt: new Date().toISOString()
    };
  }

  return request<SystemStatus>("/status", {
    headers: {}
  });
}

export async function endSession(reason = "expired") {
  try { await logoutUser(reason); }
  catch { notifySessionExpired("offline"); }
}
