"use client";

import { AppShellClient } from "./AppShellClient";

export function AppShell({ children }: { children: React.ReactNode }) {
  return <AppShellClient>{children}</AppShellClient>;
}
