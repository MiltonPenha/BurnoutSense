import type { Notice } from "./types";

export type AppNotice = Notice & { title: string };
export function showAppNotice(notice: AppNotice) {
  window.dispatchEvent(new CustomEvent<AppNotice>("burnoutsense-toast", { detail: notice }));
}
