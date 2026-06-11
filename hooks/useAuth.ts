"use client";

import type { SessionUser } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

const GUEST: SessionUser = { username: "", role: "guest" };

export function useAuth() {
  const [user, setUser] = useState<SessionUser>(GUEST);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await res.json()) as { user?: SessionUser };
      setUser(data.user ?? GUEST);
    } catch {
      setUser(GUEST);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { user?: SessionUser; error?: string };
      if (!res.ok) throw new Error(data.error ?? "登录失败");
      setUser(data.user ?? GUEST);
    },
    []
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(GUEST);
  }, []);

  return { user, loading, login, logout, refresh };
}
