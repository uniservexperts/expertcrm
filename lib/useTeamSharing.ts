"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// True when the Admin has switched on "staff can see each other's leads".
// If the database upgrade hasn't been run yet, this quietly stays false.
export function useTeamSharing() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    supabase.from("app_settings").select("value").eq("key", "staff_share_leads").maybeSingle()
      .then(({ data }) => setEnabled(data?.value === "true"));
  }, []);
  return enabled;
}
