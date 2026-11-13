import type { Assessment, Profile } from "./types";

export const STORAGE_KEYS = {
  records: "burnoutsense.v2.records",
  profile: "burnoutsense.v2.profile"
};

export const defaultProfile: Profile = {
  name: "estudante",
  email: "",
  course: "",
  semester: "",
  dailyReminder: true,
  avatarUrl: "",
  theme: "light"
};

export const defaultRecords: Assessment[] = [];

export const moods = [
  { name: "Feliz", icon: "happy" },
  { name: "Calmo", icon: "calm" },
  { name: "Ansioso", icon: "anxious" },
  { name: "Triste", icon: "sad" },
  { name: "Irritado", icon: "angry" },
  { name: "Cansado", icon: "tired" },
  { name: "Desmotivado", icon: "unmotivated" }
] as const;

export function sortRecords<T extends Assessment>(records: T[]): T[] {
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
