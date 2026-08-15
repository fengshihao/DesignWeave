"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/api";

export function AppHeader(props: {
  user: SessionUser;
  title?: string;
}) {
  async function logout() {
    await authClient.signOut();
    window.location.href = "/";
  }

  return (
    <header className="topbar">
      <div>
        <Link href="/" className="brand">
          Design<span>Weave</span>
        </Link>
        {props.title ? (
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {props.title}
          </p>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="muted" style={{ fontSize: 14 }}>
          {props.user.name} · {props.user.roleLabel}
        </span>
        <button className="btn ghost" type="button" onClick={() => void logout()}>
          退出
        </button>
      </div>
    </header>
  );
}
