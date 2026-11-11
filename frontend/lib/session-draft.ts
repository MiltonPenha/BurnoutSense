const prefix = "burnoutsense.context-draft:";
const lifetime = 2 * 60 * 60 * 1000;
export interface ContextDraft { values: Record<string, string>; step: number; withItems: boolean }
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function draftKey(accountId: string, sourceId: string) { return `${prefix}${encodeURIComponent(accountId)}:${encodeURIComponent(sourceId)}`; }

export function readContextDraft(storage: StoragePort, key: string, now = Date.now()): ContextDraft | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
    if (!value || typeof value !== "object" || !("expiresAt" in value) || typeof value.expiresAt !== "number" || value.expiresAt <= now
      || !("values" in value) || !value.values || typeof value.values !== "object" || Array.isArray(value.values)
      || Object.keys(value.values).length > 36 || Object.values(value.values).some(entry => typeof entry !== "string" || entry.length > 200)
      || !("step" in value) || !Number.isInteger(value.step) || Number(value.step) < 0 || Number(value.step) > 5
      || !("withItems" in value) || typeof value.withItems !== "boolean") {
      storage.removeItem(key); return null;
    }
    return { values: value.values as Record<string, string>, step: Number(value.step), withItems: value.withItems };
  } catch { return null; }
}

export function writeContextDraft(storage: StoragePort, key: string, value: ContextDraft, now = Date.now()) {
  try { storage.setItem(key, JSON.stringify({ ...value, expiresAt: now + lifetime })); } catch { /* Keep in-memory answers if storage is blocked. */ }
}

export function clearSessionDrafts() {
  if (typeof window === "undefined") return;
  try { Object.keys(window.sessionStorage).filter(key => key.startsWith(prefix)).forEach(key => window.sessionStorage.removeItem(key)); } catch { /* Session storage may be unavailable. */ }
}
