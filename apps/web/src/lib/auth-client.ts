import { createAuthClient } from "better-auth/react";
import { api } from "@/lib/api";

export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? "http://localhost:3100" : window.location.origin,
});

export async function logoutAndLeave(): Promise<void> {
  try {
    await api.logout();
  } catch {
    /* 仍要离开页面 */
  }
  window.location.href = "/";
}
