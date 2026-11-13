export type Theme = "light" | "dark";
export interface Profile {
  id?: string;
  name: string;
  email: string;
  course: string;
  semester: string;
  dailyReminder: boolean;
  avatarUrl: string;
  theme: Theme;
}
export interface AccountProfile extends Omit<Profile, "theme" | "course" | "semester" | "avatarUrl"> {
  id: string;
  course: string | null;
  semester: string | null;
  avatarUrl: string | null;
}
export interface AuthResponse { accessToken: string; refreshToken: string; user?: AccountProfile }
export type ContextValues = Record<string, string | number>;
export interface FormField {
  identifier: string; name: string; question: string; group: string;
  data_type: "integer" | "number" | "category";
  choices: (string | number)[]; labels: string[];
  minimum: number | null; maximum: number | null;
  unit?: string | null; allows_not_applicable: boolean; instructions: string;
}
export interface FormSchema { fields: FormField[]; consent: { version: string; text: string } }
export interface EvolutionMetadata {
  reason?: "check_in_saved" | "check_in_deleted" | "window_refresh";
  trigger?: CheckInOrigin;
  recordedDays: number; experimental: boolean; version: string;
  anchorAssessmentId: string; windowStart: string; windowEnd: string;
  aggregatedFields: string[]; carriedFields: string[];
}
export interface CheckInOrigin { id: string; date: string; createdAt: string; updatedAt: string }
export interface TrendRecord { id: string; createdAt: string; estimatedOverall: number; triggerCheckIn?: CheckInOrigin | null }
export type ReviewTopicId = "demandas" | "trabalho" | "apoio" | "rotina";
export interface ReviewTopic { id: ReviewTopicId; title: string; description: string; fieldIds: string[] }
export interface ReviewPlan { topics: ReviewTopic[]; suggested: ReviewTopicId | null }
export interface GuidedReviewMetadata {
  kind: "guided_review"; topic: ReviewTopicId; topicTitle: string; reviewedFields: string[]; previousEstimatedOverall: number;
}
export interface Assessment {
  triggerCheckIn?: CheckInOrigin | null;
  id: string; createdAt: string; source: "context" | "daily_experimental" | "guided_review";
  estimatedOverall: number; observedOverall: number | null;
  observedExhaustion: number | null; observedDistancing: number | null; observedInefficacy: number | null;
  modelName: string; modelVersion: string; datasetVersion: string;
  contractVersion: string; formVersion: string; evolution: EvolutionMetadata | GuidedReviewMetadata | null;
}
export interface AssessmentDetail extends Assessment {
  context: ContextValues; observedItems?: ContextValues | null;
  consentVersion: string; consentAcceptedAt: string;
}
export interface CurrentContext { assessment: AssessmentDetail | null; canReuseConsent: boolean }
export interface CreateAssessment {
  context: ContextValues; items?: ContextValues;
  adult: boolean; enrolled: boolean; consent: boolean; consentVersion: string;
}
export interface ReviewContext { context: ContextValues; items?: ContextValues; sourceAssessmentId: string; confirmed: true }
export interface PageResult<T> { items: T[]; nextCursor: string | null }
export type ObservationKey = "sleep_quality" | "assessment_pressure" | "study_rest_difficulty" | "personal_support";
export type DailyObservations = Record<ObservationKey, number>;
export type ObservationDraft = Record<ObservationKey, number | "">;
export interface DailyQuestion { key: ObservationKey; title: string; labels: string[] }
export interface DailyCheckIn {
  id: string; date: string; mood: string; sleepHours: number;
  energy: number | null; academicDemand: number | null;
  observations: DailyObservations | null; note: string; createdAt: string; updatedAt: string;
}
export interface SaveDailyCheckIn { date?: string; mood: string; sleepHours: number; observations?: DailyObservations; note?: string; energy?: number; academicDemand?: number }
export interface IndexUpdate {
  status: "updated" | "unchanged" | "historical" | "disabled" | "needs_context" | "superseded" | "unavailable";
  assessment?: AssessmentDetail;
}
export interface SavedDailyCheckIn extends DailyCheckIn { indexUpdate: IndexUpdate }
export interface DailyDay { date: string; checkIn: DailyCheckIn | null }
export interface DailyOverview {
  today: string; timeZone: string; completedDays: number; recentCheckIns: DailyCheckIn[];
  todayCheckIn: DailyCheckIn | null; windowStart: string;
  evolution: { enabled: boolean; pending: boolean; recordedDays: number; experimental?: boolean; version?: string };
}
export interface SystemStatus {
  backend: { status: string }; database: { status: string }; aiService: { status: string };
  model: { loaded: boolean; status: string; modelName?: string; datasetVersion?: string };
  checkedAt: string;
}
export interface NotificationResult {
  dailyReminder: { status: string; reason?: string }; message: string;
}
export interface Notice { tone: "success" | "error" | "warning"; message: string }
export interface GuidanceItem { title: string; text: string }
export type GuidanceResult = { assessmentId: string } & (
  { status: "ready"; provider: "gemini"; generatedAt: string; basedOnPercentage: number; tips: GuidanceItem[]; recommendations: GuidanceItem[] }
  | { status: "not_configured" | "invalid_credentials" | "rate_limited" | "unavailable"; message: string }
);
export type ToastStyle = React.CSSProperties & { "--toast-duration": string };
