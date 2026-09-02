"use client";

import Link from "next/link";
import { logoutAndLeave } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/api";
import { WeaveIcon } from "@/components/WeaveMark";

export function AppHeader(props: {
  user: SessionUser;
  title?: string;
}) {
  async function logout() {
    await logoutAndLeave();
  }

  return (
    <header className="topbar">
      <div>
        <Link href="/" className="brand brand-with-mark">
          <WeaveIcon size={28} />
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
