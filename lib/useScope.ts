"use client";
import { useEffect, useState } from "react";
import type { Scope } from "@/lib/types";

const KEY = "crm-scope";
const valid = (v: any): v is Scope => v === "mine" || v === "others" || v === "all";

// Remembers whether a staff member is viewing their own leads, colleagues',
// or everyone's. Also honours ?scope=... in the URL (used by dashboard links).
export function useScope(): [Scope, (s: Scope) => void] {
  const [scope, setScopeState] = useState<Scope>("mine");
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("scope");
      const v = fromUrl || localStorage.getItem(KEY);
      if (valid(v)) {
        setScopeState(v);
        if (fromUrl) localStorage.setItem(KEY, v);
      }
    } catch {}
  }, []);
  const setScope = (s: Scope) => {
    setScopeState(s);
    try { localStorage.setItem(KEY, s); } catch {}
  };
  return [scope, setScope];
}
