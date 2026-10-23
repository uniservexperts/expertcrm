import { Lead, toLocalDateStr } from "@/lib/types";
import type { XCell } from "@/lib/xlsx";

export const EXPORT_HEADERS = [
  "Lead ID", "Name", "Mobile", "Location", "Country", "Source", "Status", "Assigned to",
  "Date added", "Last updated", "Next follow-up", "Follow-up type", "Follow-up note", "Last call note",
];
export const EXPORT_WIDTHS = [10, 24, 15, 18, 14, 16, 20, 16, 13, 18, 14, 13, 30, 45];
const MOBILE_COL = 2;

export type ExportCtx = {
  staffName: (id: string | null) => string;
  countryName: (id: number | null) => string;
  notes: Record<string, string>; // lead id -> latest call note
};

export function leadsToRows(leads: Lead[], ctx: ExportCtx): XCell[][] {
  return leads.map((l) => [
    l.lead_code,
    l.name?.trim() || "",
    l.mobile,
    l.location || "",
    ctx.countryName(l.country_id),
    l.source || "",
    l.status,
    l.assigned_staff_id ? ctx.staffName(l.assigned_staff_id) || "Unassigned" : "Unassigned",
    { d: toLocalDateStr(l.created_at) },
    { t: new Date(l.last_activity_at || l.created_at) },
    l.next_followup_date ? { d: l.next_followup_date } : null,
    l.next_followup_type || "",
    l.next_followup_note || "",
    ctx.notes[l.id] || "",
  ]);
}

const pad = (n: number) => String(n).padStart(2, "0");
function cellText(c: XCell): string {
  if (c === null) return "";
  if (typeof c === "number") return String(c);
  if (typeof c === "string") return c;
  if ("d" in c) return c.d;
  const t = c.t;
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

// CSV for importing into other tools. Starts with a UTF-8 byte-order mark so
// Excel shows names in any language correctly.
// Spreadsheet-formula guard: text typed by staff that starts with = + - @ could
// run as a formula when the file is opened in Excel, so it gets a leading '.
// The Mobile column is exempt for "+" and "-" (so +91... numbers stay intact).
export function toCsv(headers: string[], rows: XCell[][]): string {
  const guard = (s: string, isMobile: boolean) => {
    if (!s) return s;
    const f = s[0];
    if (f === "=" || f === "@" || f === "\t" || f === "\r") return "'" + s;
    if (!isMobile && (f === "+" || f === "-")) return "'" + s;
    return s;
  };
  const quote = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [
    headers.map(quote).join(","),
    ...rows.map((r) => r.map((c, i) => quote(guard(cellText(c), i === MOBILE_COL))).join(",")),
  ];
  return "\uFEFF" + lines.join("\r\n");
}
