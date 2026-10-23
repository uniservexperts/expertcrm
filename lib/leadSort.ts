import type { Lead } from "@/lib/types";

export type SortKey = "updated" | "created" | "followup" | "name" | "location" | "status" | "assigned";
export type SortDir = "asc" | "desc";

export const SORT_DEFS: { key: SortKey; label: string; asc: string; desc: string; defaultDir: SortDir }[] = [
  { key: "updated", label: "Last updated", asc: "Oldest first", desc: "Newest first", defaultDir: "desc" },
  { key: "created", label: "Date added", asc: "Oldest first", desc: "Newest first", defaultDir: "desc" },
  { key: "followup", label: "Next follow-up", asc: "Soonest first", desc: "Latest first", defaultDir: "asc" },
  { key: "name", label: "Name", asc: "A–Z", desc: "Z–A", defaultDir: "asc" },
  { key: "location", label: "Location", asc: "A–Z", desc: "Z–A", defaultDir: "asc" },
  { key: "status", label: "Status", asc: "Pipeline order", desc: "Reverse pipeline", defaultDir: "asc" },
  { key: "assigned", label: "Assigned to", asc: "A–Z", desc: "Z–A", defaultDir: "asc" },
];

export type SortCtx = {
  statusOrder: string[];                  // statuses in pipeline order (Settings order)
  staffName: (id: string | null) => string; // "" when unassigned
};

const touched = (l: Lead) => new Date(l.last_activity_at || l.created_at).getTime();
const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

// Blank values (no name, no location, no follow-up, unassigned...) always sink
// to the bottom, whichever direction you sort in.
export function sortLeads(leads: Lead[], key: SortKey, dir: SortDir, ctx: SortCtx): Lead[] {
  const sign = dir === "asc" ? 1 : -1;

  const byText = (get: (l: Lead) => string) => (a: Lead, b: Lead) => {
    const x = get(a).trim(), y = get(b).trim();
    if (!x && !y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return sign * compareText(x, y);
  };

  let cmp: (a: Lead, b: Lead) => number;
  switch (key) {
    case "created":
      cmp = (a, b) => sign * (+new Date(a.created_at) - +new Date(b.created_at));
      break;
    case "followup":
      cmp = (a, b) => {
        const x = a.next_followup_date, y = b.next_followup_date;
        if (!x && !y) return 0;
        if (!x) return 1;
        if (!y) return -1;
        return sign * x.localeCompare(y);
      };
      break;
    case "name": cmp = byText((l) => l.name || ""); break;
    case "location": cmp = byText((l) => l.location || ""); break;
    case "assigned": cmp = byText((l) => (l.assigned_staff_id ? ctx.staffName(l.assigned_staff_id) : "")); break;
    case "status":
      cmp = (a, b) => {
        const i = ctx.statusOrder.indexOf(a.status), j = ctx.statusOrder.indexOf(b.status);
        if (i < 0 && j < 0) return 0;
        if (i < 0) return 1;
        if (j < 0) return -1;
        return sign * (i - j);
      };
      break;
    default: // "updated"
      cmp = (a, b) => sign * (touched(a) - touched(b));
  }
  // Ties: most recently updated first, then by id, so the order is stable
  return [...leads].sort((a, b) => cmp(a, b) || touched(b) - touched(a) || a.id.localeCompare(b.id));
}
