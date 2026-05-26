import { defaultProfile, defaultRecords, sortRecords, STORAGE_KEYS } from "@/lib/burnout-data";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const AUTH_KEYS = {
  accessToken: "burnoutsense.auth.accessToken",
  refreshToken: "burnoutsense.auth.refreshToken"
};

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

function clearAuthTokens() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(AUTH_KEYS.accessToken);
    window.localStorage.removeItem(AUTH_KEYS.refreshToken);
  }
}

function persistAuthResponse(authResponse) {
  writeToken(AUTH_KEYS.accessToken, authResponse.accessToken);
  writeToken(AUTH_KEYS.refreshToken, authResponse.refreshToken);

  if (authResponse.user) {
    writeJson(STORAGE_KEYS.profile, normalizeProfile(authResponse.user));
  }

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
    clearAuthTokens();
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function normalizeProfile(user) {
  const localProfile = readJson(STORAGE_KEYS.profile, defaultProfile);

  return {
    ...defaultProfile,
    ...localProfile,
    id: user.id,
    name: user.name ?? localProfile.name,
    email: user.email ?? localProfile.email
  };
}

function moodToAnxietyLevel(mood, stress, tiredness) {
  const moodMap = {
    Feliz: 2,
    Calmo: 3,
    Ansioso: Math.max(8, stress),
    Triste: Math.max(6, tiredness),
    Irritado: Math.max(7, stress),
    Cansado: Math.max(5, tiredness),
    Desmotivado: Math.max(6, tiredness)
  };

  return clampInt(moodMap[mood] ?? stress, 1, 10);
}

function moodToMotivationLevel(mood, tiredness) {
  const moodMap = {
    Feliz: 9,
    Calmo: 8,
    Ansioso: 5,
    Triste: 4,
    Irritado: 5,
    Cansado: 4,
    Desmotivado: 2
  };

  const base = moodMap[mood] ?? 6;
  return clampInt(base - Math.max(0, tiredness - 7), 1, 10);
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
  const workHours = clampNumber(record.workHours, 0, 24);
  const pendingTasks = clampInt(record.pendingTasks, 0, 30);
  const importantDeliveryPenalty = record.importantDelivery ? 1 : 0;

  return {
    studyHours,
    sleepQuality: clampInt(record.sleepQuality, 1, 10),
    stressLevel: stress,
    anxietyLevel: moodToAnxietyLevel(record.mood, stress, tiredness),
    academicPerformance: clampInt(10 - pendingTasks - importantDeliveryPenalty, 1, 10),
    screenTime: clampNumber(studyHours + workHours, 0, 24),
    socialSupport: ["Feliz", "Calmo"].includes(record.mood) ? 8 : 5,
    financialStress: clampInt(workHours >= 8 ? 7 : workHours > 0 ? 5 : 3, 1, 10),
    physicalActivity: clampInt(tiredness >= 8 ? 1 : 3, 0, 7),
    motivationLevel: moodToMotivationLevel(record.mood, tiredness)
  };
}

export function assessmentToRecord(assessment, fallback = {}) {
  const date = assessment.createdAt ? assessment.createdAt.slice(0, 10) : fallback.date;
  const estimatedPendingTasks = Math.max(0, 10 - Number(assessment.academicPerformance ?? 8));
  const tiredness = clampInt(Math.max(assessment.stressLevel ?? 5, 11 - (assessment.motivationLevel ?? 6)), 1, 10);

  return {
    id: assessment.id ?? fallback.id,
    date: date ?? new Date().toISOString().slice(0, 10),
    sleepHours: fallback.sleepHours ?? 7,
    studyHours: assessment.studyHours ?? fallback.studyHours ?? 0,
    workHours: fallback.workHours ?? 0,
    pendingTasks: fallback.pendingTasks ?? estimatedPendingTasks,
    importantDelivery: fallback.importantDelivery ?? false,
    sleepQuality: assessment.sleepQuality ?? fallback.sleepQuality ?? 7,
    stress: assessment.stressLevel ?? fallback.stress ?? 5,
    tiredness: fallback.tiredness ?? tiredness,
    mood: fallback.mood ?? moodFromAssessment(assessment),
    notes: fallback.notes ?? resultNotes(assessment.result),
    backendResult: assessment.result ?? null
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

export async function getProfile() {
  if (hasBackend()) {
    const user = await request("/users/me");
    return normalizeProfile(user);
  }

  return readJson(STORAGE_KEYS.profile, defaultProfile);
}

export async function updateProfile(profile) {
  writeJson(STORAGE_KEYS.profile, profile);
  return profile;
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
  if (hasBackend()) {
    const refreshToken = readToken(AUTH_KEYS.refreshToken);
    const body = refreshToken ? { refreshToken } : {};

    await request("/auth/logout", {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  clearAuthTokens();
}
