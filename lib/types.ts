export type Profile = { id: string; full_name: string; role: "admin" | "staff"; active: boolean };

export type Lead = {
  id: string;
  lead_code: string;
  name: string;
  mobile: string;
  location: string | null;
  source: string | null;
  country_id: number | null;
  assigned_staff_id: string | null;
  status: string;
  created_at: string;
  next_followup_date: string | null;
  next_followup_type: string | null;
  next_followup_reminder: boolean | null;
  next_followup_note: string | null;
  converted: boolean;
  client_id: string | null;
};

export type LeadActivity = {
  id: string;
  lead_id: string;
  actor_name: string;
  activity_type: string;
  detail: string | null;
  created_at: string;
};

export type Client = {
  id: string;
  client_code: string;
  lead_id: string | null;
  name: string;
  mobile: string;
  location: string | null;
  country_id: number | null;
  assigned_staff_id: string | null;
  conversion_date: string;
  converted_by: string | null;
  total_fee: number;
  visa_status: "Pending with VFS" | "Approved" | "Refused";
  notes: string | null;
};

export const DOC_KEYS: [string, string][] = [
  ["passportFront", "Passport Front"],
  ["passportBack", "Passport Back"],
  ["aadhaar", "Aadhaar"],
  ["pan", "PAN"],
  ["bankStatement", "Bank Statement"],
];

export const FOLLOWUP_TYPES = ["Call", "Visit", "Email", "WhatsApp"];
export const LEAD_SOURCES = ["Online Marketing", "Referral", "Walk-in", "Social Media", "Other"];

// Always use LOCAL calendar date, never UTC — new Date().toISOString() returns
// the UTC date, which drifts a day off from local "today" for timezones ahead
// of UTC (like India, UTC+5:30) during the hours after local midnight.
function localDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function todayStr() {
  return localDateStr(new Date());
}
// Converts a full UTC timestamp (e.g. a Postgres created_at) into the LOCAL
// calendar date, for correctly comparing "was this created today" etc.
export function toLocalDateStr(isoTimestamp: string) {
  return localDateStr(new Date(isoTimestamp));
}
export function dayDiff(dateStr: string) {
  const a = new Date(todayStr() + "T00:00:00");
  const b = new Date(dateStr + "T00:00:00");
  return Math.round((+b - +a) / 86400000);
}
export function fmtDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
export function followUpLabel(dateStr: string | null | undefined) {
  if (!dateStr) return "No follow-up set";
  const d = dayDiff(dateStr);
  if (d < 0) return `Overdue by ${Math.abs(d)} day${Math.abs(d) > 1 ? "s" : ""}`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Upcoming — ${fmtDate(dateStr)}`;
}
export function followUpTone(dateStr: string | null | undefined) {
  if (!dateStr) return "slate";
  const d = dayDiff(dateStr);
  if (d < 0) return "red";
  if (d === 0) return "brass";
  return "blue";
}
