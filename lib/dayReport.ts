import { Lead, toLocalDateStr, todayStr, addDaysStr } from "@/lib/types";

// Reads "from → to" out of a status-change log entry. Handles both formats:
//   old style:  type "Status changed", detail "Interested → Call Later"
//   combined:   type "Lead updated",   detail "Note: ... · Status: Interested → Call Later · ..."
// and the entries written when the Admin removes a status:
//   "Waiting → Interested (status "Waiting" was removed by Admin)"
export function parseStatusChange(type: string, detail: string | null): { from: string; to: string } | null {
  const parse = (txt: string) => {
    const m = txt.match(/^(.*?) → (.*?)(?: \(status ".*" was removed by Admin\))?$/);
    return m ? { from: m[1].trim(), to: m[2].trim() } : null;
  };
  if (type === "Status changed") return parse(detail || "");
  if (type === "Lead updated") {
    for (const part of (detail || "").split(" · ")) {
      if (part.startsWith("Status: ")) return parse(part.slice("Status: ".length));
    }
  }
  return null;
}

// [today, yesterday, ...] as YYYY-MM-DD, newest first
export function lastNDays(n: number): string[] {
  const t = todayStr();
  return Array.from({ length: n }, (_, i) => addDaysStr(t, -i));
}

export type DayRow = {
  day: string;
  newLeads: number;                  // leads added that day
  closed: number;                    // leads moved into any "no follow-up needed" status that day
  byStatus: Record<string, number>;  // leads moved into each status that day
};

export type DayActivity = { lead_id: string; actor_id: string | null; activity_type: string; detail: string | null; created_at: string };

// Day-by-day counts.
//  * New leads: counted from the leads' creation date (only leads passing `leadFilter`).
//  * Status counts: from the activity log. Each lead is counted ONCE per day,
//    under the LAST status it was moved to that day (so a lead set to
//    Interested and then Not Interested the same day counts only as Not Interested).
//    Only changes made by actors passing `actorFilter` are counted.
export function buildDayWise(args: {
  days: string[];
  leads: Lead[];
  activities: DayActivity[];
  closing: string[];
  statuses: string[];
  leadFilter?: (l: Lead) => boolean;
  actorFilter?: (actorId: string | null) => boolean;
}): DayRow[] {
  const { days, leads, activities, closing, statuses, leadFilter, actorFilter } = args;
  const rows: Record<string, DayRow> = {};
  for (const day of days) {
    rows[day] = { day, newLeads: 0, closed: 0, byStatus: Object.fromEntries(statuses.map((s) => [s, 0])) };
  }

  for (const l of leads) {
    if (leadFilter && !leadFilter(l)) continue;
    const row = rows[toLocalDateStr(l.created_at)];
    if (row) row.newLeads++;
  }

  // last status change per (day, lead)
  const last = new Map<string, { to: string; at: number; day: string }>();
  for (const a of activities) {
    if (actorFilter && !actorFilter(a.actor_id)) continue;
    const change = parseStatusChange(a.activity_type, a.detail);
    if (!change) continue;
    const day = toLocalDateStr(a.created_at);
    if (!rows[day]) continue;
    const key = `${day}|${a.lead_id}`;
    const at = new Date(a.created_at).getTime();
    const prev = last.get(key);
    if (!prev || at >= prev.at) last.set(key, { to: change.to, at, day });
  }
  Array.from(last.values()).forEach(({ to, day }) => {
    const row = rows[day];
    if (to in row.byStatus) row.byStatus[to]++;
    if (closing.includes(to)) row.closed++;
  });

  return days.map((d) => rows[d]);
}

export function totalsOf(rows: DayRow[], statuses: string[]): DayRow {
  const total: DayRow = { day: "Total", newLeads: 0, closed: 0, byStatus: Object.fromEntries(statuses.map((s) => [s, 0])) };
  for (const r of rows) {
    total.newLeads += r.newLeads;
    total.closed += r.closed;
    for (const s of statuses) total.byStatus[s] += r.byStatus[s] || 0;
  }
  return total;
}
