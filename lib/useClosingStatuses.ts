"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Fallback used until the database upgrade (status_rules.sql) has been run:
// these names mean "no need to call again".
export function isDefaultClosing(name: string) {
  return name === "Not Interested" || name === "Cancelled" || /closed|complet/i.test(name);
}

// Names of the lead statuses that close a lead (no follow-up needed).
// The Admin controls this per status in Settings.
export function useClosingStatuses(): string[] {
  const [closing, setClosing] = useState<string[]>(["Not Interested", "Cancelled"]);
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase.from("lead_statuses").select("name, closes_lead");
      if (!error && data) {
        setClosing(data.filter((s: any) => s.closes_lead).map((s: any) => s.name));
        return;
      }
      // closes_lead column doesn't exist yet: fall back to name-based defaults
      const { data: names } = await supabase.from("lead_statuses").select("name");
      if (names) setClosing(names.map((s: any) => s.name).filter(isDefaultClosing));
    })();
  }, []);
  return closing;
}
