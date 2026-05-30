import { defaultProfile, defaultRecords, sortRecords, STORAGE_KEYS } from "@/lib/burnout-data";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const AUTH_KEYS = {
  accessToken: "burnoutsense.auth.accessToken",
  refreshToken: "burnoutsense.auth.refreshToken"
};

export const SESSION_TIMEOUT_MINUTES = 30;

function hasBackend() {
  return Boolean(API_URL);
}

function endpoint(path) {
  return `${API_URL}${path}`;
}

function clampNumber(value, min, max) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}

function clampInt(value, min, max) {
  return Math.round(clampNumber(value, min, max));
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

function clearAuthTokens(reason) {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(AUTH_KEYS.accessToken);
    window.localStorage.removeItem(AUTH_KEYS.refreshToken);
    if (reason) {
      notifySessionExpired(reason);
    }
    notifyAuthChange();
  }
}

function persistAuthResponse(authResponse) {
  writeToken(AUTH_KEYS.accessToken, authResponse.accessToken);
  writeToken(AUTH_KEYS.refreshToken, authResponse.refreshToken);

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

async function request(path, options = {}) {
  const response = await fetch(endpoint(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...options.headers
    }
  });

  if (response.status === 401) {
    clearAuthTokens("expired");
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

  return {
    ...defaultProfile,
    ...accountProfile,
    id: user.id,
    name: user.name ?? accountProfile.name,
    email: user.email ?? accountProfile.email,
    course: normalizeCourse(accountProfile.course),
    semester: normalizeSemester(accountProfile.semester),
    emailAlerts: user.emailAlerts ?? accountProfile.emailAlerts,
    dailyReminder: user.dailyReminder ?? accountProfile.dailyReminder
  };
}

function normalizeCourse(course) {
  return course === "Ciência da Computação" ? "" : course ?? "";
}

function normalizeSemester(semester) {
  return semester === "4º semestre" ? "" : semester ?? "";
}

function moodFromAssessment(assessment) {
  if (assessment.anxietyLevel >= 8) {
    return "Ansioso";
  }

  if (assessment.motivationLevel <= 3) {
    return "Desmotivado";
  }

  if (assessment.stressLevel >= 8) {
    return "Irritado";
  }

  if (assessment.motivationLevel >= 8) {
    return "Calmo";
  }

  return "Cansado";
}

function resultNotes(result) {
  if (!result?.mainFactors) {
    return "";
  }

  if (Array.isArray(result.mainFactors)) {
    return result.mainFactors.join(", ");
  }

  return JSON.stringify(result.mainFactors);
}

export function recordToAssessmentDto(record) {
  const stress = clampInt(record.stress, 1, 10);
  const tiredness = clampInt(record.tiredness, 1, 10);
  const studyHours = clampNumber(record.studyHours, 0, 24);
  const pendingTasks = clampInt(record.pendingTasks, 0, 30);

  return {
    date: record.date,
    studyHours,
    sleepHours: clampNumber(record.sleepHours, 0, 24),
    workHours: clampNumber(record.workHours, 0, 24),
    pendingTasks,
    hasImportantExamOrDelivery: Boolean(record.importantDelivery),
    sleepQuality: clampInt(record.sleepQuality, 1, 10),
    stressLevel: stress,
    tirednessLevel: tiredness,
    academicPerformance: clampInt(record.academicPerformance ?? Math.max(0, 10 - pendingTasks), 0, 10),
    examPressure: clampInt(record.examPressure ?? (record.importantDelivery ? 8 : stress), 0, 10),
    screenTime: clampNumber(record.screenTime ?? studyHours, 0, 24),
    socialSupport: clampInt(record.socialSupport ?? (["Feliz", "Calmo"].includes(record.mood) ? 8 : 5), 0, 10),
    financialStress: clampInt(record.financialStress ?? 3, 0, 10),
    physicalActivity: clampInt(record.physicalActivity ?? (tiredness >= 8 ? 1 : 5), 0, 10),
    mood: record.mood,
    dailyDescription: record.notes
  };
}

export function assessmentToRecord(assessment, fallback = {}) {
  const date = assessment.date ? assessment.date.slice(0, 10) : assessment.createdAt ? assessment.createdAt.slice(0, 10) : fallback.date;
  const estimatedPendingTasks = Math.max(0, 10 - Number(assessment.academicPerformance ?? 8));
  const tiredness = assessment.tirednessLevel ?? clampInt(Math.max(assessment.stressLevel ?? 5, 11 - (assessment.motivationLevel ?? 6)), 1, 10);
  const examPressure = assessment.examPressure ?? fallback.examPressure ?? (fallback.importantDelivery ? 8 : Math.max(5, assessment.stressLevel ?? 5));
  const importantDelivery =
    assessment.hasImportantExamOrDelivery ?? fallback.importantDelivery ?? fallback.hasImportantExamOrDelivery ?? examPressure >= 7;

  return {
    id: assessment.id ?? fallback.id,
    date: date ?? new Date().toISOString().slice(0, 10),
    sleepHours: assessment.sleepHours ?? fallback.sleepHours ?? 7,
    studyHours: assessment.studyHours ?? fallback.studyHours ?? 0,
    workHours: assessment.workHours ?? fallback.workHours ?? 0,
    pendingTasks: assessment.pendingTasks ?? fallback.pendingTasks ?? estimatedPendingTasks,
    importantDelivery,
    screenTime: assessment.screenTime ?? fallback.screenTime ?? 0,
    academicPerformance: assessment.academicPerformance ?? fallback.academicPerformance ?? 7,
    examPressure,
    sleepQuality: assessment.sleepQuality ?? fallback.sleepQuality ?? 7,
    stress: assessment.stressLevel ?? fallback.stress ?? 5,
    tiredness: tiredness ?? fallback.tiredness ?? 5,
    physicalActivity: assessment.physicalActivity ?? fallback.physicalActivity ?? 5,
    socialSupport: assessment.socialSupport ?? fallback.socialSupport ?? 6,
    financialStress: assessment.financialStress ?? fallback.financialStress ?? 3,
    mood: assessment.mood ?? fallback.mood ?? moodFromAssessment(assessment),
    notes: assessment.dailyDescription ?? fallback.notes ?? resultNotes(assessment.result),
    backendResult: assessment.result
      ? {
          ...assessment.result,
          modelUsed: assessment.result.modelUsed ?? assessment.result.modelVersion
        }
      : null
  };
}

export async function getRecords() {
  if (hasBackend()) {
    const assessments = await request("/assessments");
    return sortRecords(assessments.map((assessment) => assessmentToRecord(assessment)));
  }

  return sortRecords(readJson(STORAGE_KEYS.records, defaultRecords));
}

export async function getRecordById(id) {
  if (hasBackend()) {
    const assessment = await request(`/assessments/${id}`);
    return assessmentToRecord(assessment);
  }

  const records = readJson(STORAGE_KEYS.records, defaultRecords);
  return records.find((record) => record.id === id) ?? null;
}

export async function getAssessmentResult(assessmentId) {
  if (hasBackend()) {
    return request(`/results/${assessmentId}`);
  }

  const record = await getRecordById(assessmentId);
  return record?.backendResult ?? null;
}

export async function createRecord(record) {
  if (hasBackend()) {
    const assessment = await request("/assessments", {
      method: "POST",
      body: JSON.stringify(recordToAssessmentDto(record))
    });

    return assessmentToRecord(assessment, record);
  }

  const records = readJson(STORAGE_KEYS.records, defaultRecords);
  const nextRecords = sortRecords([record, ...records]);
  writeJson(STORAGE_KEYS.records, nextRecords);
  return record;
}

export async function updateRecord(id, record) {
  if (hasBackend()) {
    const assessment = await request(`/assessments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(recordToAssessmentDto(record))
    });

    return assessmentToRecord(assessment, { ...record, id });
  }

  const records = readJson(STORAGE_KEYS.records, defaultRecords);
  const nextRecord = { ...record, id };
  const nextRecords = sortRecords(records.map((item) => (item.id === id ? nextRecord : item)));
  writeJson(STORAGE_KEYS.records, nextRecords);
  return nextRecord;
}

export async function deleteRecord(id) {
  if (hasBackend()) {
    await request(`/assessments/${id}`, {
      method: "DELETE"
    });
    return;
  }

  const records = readJson(STORAGE_KEYS.records, defaultRecords);
  writeJson(STORAGE_KEYS.records, records.filter((record) => record.id !== id));
}

export async function getProfile() {
  if (hasBackend()) {
    const user = await request("/users/me");
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
        dailyReminder: profile.dailyReminder
      })
    });
    const normalizedProfile = {
      ...normalizeProfile(user),
      course: profile.course,
      semester: profile.semester,
      avatarUrl: profile.avatarUrl ?? "",
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
