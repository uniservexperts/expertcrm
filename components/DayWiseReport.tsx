"use client";
import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Lead, Profile, localRangeToISO } from "@/lib/types";
import { fetchAllRows } from "@/lib/fetchAll";
import { buildDayWise, totalsOf, lastNDays, DayRow } from "@/lib/dayReport";
import { statusDotColor } from "@/components/ui";

const HIDDEN_KEY = "crm-daywise-hidden";

type Col = { id: string; label: string; kind: "new" | "closed" | "status"; status?: string };
type Props = {
  isAdmin: boolean;
  meId: string;
  leads: Lead[];
  statuses: string[];   // all statuses, in pipeline order
  closing: string[];    // statuses marked "No follow-up needed"
  staff: Profile[];     // Admin only
};

const PERIODS: [number, string][] = [[7, "Last 7 days"], [14, "Last 14 days"], [30, "Last 30 days"]];

const dayLabel = (day: string) =>
  new Date(day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });

export default function DayWiseReport({ isAdmin, meId, leads, statuses, closing, staff }: Props) {
  const supabase = createClient();
  const [days, setDays] = useState(7);
  const [acts, setActs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // remember which counts were ticked
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw)));
    } catch {}
  }, []);
  function saveHidden(next: Set<string>) {
    setHidden(next);
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next))); } catch {}
  }

  const dayList = lastNDays(days);

  // status changes in the period (staff only ever load their own)
  useEffect(() => {
    if (!meId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = lastNDays(days);
      const { startISO, endISO } = localRangeToISO(list[list.length - 1], list[0]);
      const rows = await fetchAllRows<any>((a, b) => {
        let q = supabase.from("lead_activities")
          .select("id, lead_id, actor_id, activity_type, detail, created_at")
          .in("activity_type", ["Status changed", "Lead updated"])
          .gte("created_at", startISO).lt("created_at", endISO);
        if (!isAdmin) q = q.eq("actor_id", meId);
        return q.order("created_at", { ascending: false }).order("id").range(a, b);
      });
      if (!cancelled) { setActs(rows); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [days, isAdmin, meId]);

  const allCols: Col[] = [
    { id: "new", label: "New leads added", kind: "new" },
    { id: "closed", label: "Closed (all)", kind: "closed" },
    ...statuses.map((s): Col => ({ id: `s:${s}`, label: s, kind: "status", status: s })),
  ];
  const cols = allCols.filter((c) => !hidden.has(c.id));

  const common = { days: dayList, activities: acts, closing, statuses };
  const teamRows = buildDayWise({ ...common, leads });
  const staffTables = isAdmin
    ? staff.map((s) => ({
        s,
        rows: buildDayWise({
          ...common, leads,
          leadFilter: (l) => l.assigned_staff_id === s.id,
          actorFilter: (id) => id === s.id,
        }),
      }))
    : [];

  function toggle(id: string) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id); else next.add(id);
    saveHidden(next);
  }
  const keyCountsOnly = () =>
    saveHidden(new Set(allCols.filter((c) => !(c.kind === "new" || c.kind === "closed" || c.status === "Cancelled")).map((c) => c.id)));

  const val = (r: DayRow, c: Col) =>
    c.kind === "new" ? r.newLeads : c.kind === "closed" ? r.closed : r.byStatus[c.status!] || 0;

  const renderTable = (rows: DayRow[]) => {
    const total = totalsOf(rows, statuses);
    const cell = (n: number, bold = false) =>
      <td className={`px-3 py-2 text-center ${bold ? "font-semibold text-ink" : ""}`}>{n ? n : <span className="text-slate-300">–</span>}</td>;
    return (
      <div className="rounded-lg border border-slate-200 overflow-x-auto bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-left px-3 py-2.5 font-medium text-slate-500 whitespace-nowrap">Day</th>
              {cols.map((c) => (
                <th key={c.id} className="px-3 py-2.5 font-medium text-slate-500 text-center align-bottom min-w-[84px]"
                    title={c.kind === "closed" ? `Closed = ${closing.join(", ") || "none set"}` : undefined}>
                  <span className="inline-flex items-center justify-center gap-1.5 text-xs leading-tight">
                    {c.kind === "status" && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotColor(c.status!)}`} />}
                    {c.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.day} className={`border-t border-slate-200 ${i === 0 ? "bg-indigo-50/40" : ""}`}>
                <td className="px-3 py-2 whitespace-nowrap text-ink">
                  {dayLabel(r.day)}{i === 0 && <span className="ml-2 text-xs text-indigo-600 font-medium">Today</span>}
                </td>
                {cols.map((c) => <React.Fragment key={c.id}>{cell(val(r, c))}</React.Fragment>)}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td className="px-3 py-2 font-semibold text-ink">Total</td>
              {cols.map((c) => <React.Fragment key={c.id}>{cell(val(total, c), true)}</React.Fragment>)}
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-ink">Day-wise report</div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map(([n, label]) => (
            <button
              key={n}
              type="button"
              onClick={() => setDays(n)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${days === n ? "bg-navy text-white border-navy" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-xs font-medium text-slate-500">Tick the counts you want to see</div>
          <div className="flex gap-3 text-xs">
            <button type="button" onClick={() => saveHidden(new Set())} className="text-navy3 underline">All</button>
            <button type="button" onClick={keyCountsOnly} className="text-navy3 underline">New, Closed and Cancelled only</button>
            <button type="button" onClick={() => saveHidden(new Set(allCols.map((c) => c.id)))} className="text-navy3 underline">None</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {allCols.map((c) => {
            const on = !hidden.has(c.id);
            return (
              <label key={c.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm cursor-pointer select-none ${on ? "border-navy bg-indigo-50/60 text-ink" : "border-slate-200 text-slate-500 bg-white"}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(c.id)} />
                {c.kind === "status" && <span className={`w-2 h-2 rounded-full ${statusDotColor(c.status!)}`} />}
                {c.label}
              </label>
            );
          })}
        </div>
      </div>

      {!cols.length ? (
        <div className="text-sm p-6 text-center rounded-lg bg-white border border-slate-200 text-slate-400">Tick at least one count above to see the report.</div>
      ) : (
        <>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-2">
              {isAdmin ? "Whole team" : "Your numbers"}{loading ? " (updating…)" : ""}
            </div>
            {renderTable(teamRows)}
          </div>

          {isAdmin && (
            <div>
              <div className="text-sm font-semibold text-ink mb-3">Staff-wise (a separate table for each person)</div>
              <div className="space-y-5">
                {staffTables.map(({ s, rows }) => (
                  <div key={s.id}>
                    <div className="text-xs font-medium text-slate-500 mb-2">{s.full_name}{!s.active ? " (inactive)" : ""}</div>
                    {renderTable(rows)}
                  </div>
                ))}
                {!staffTables.length && <div className="text-sm text-slate-400">No staff accounts yet.</div>}
              </div>
            </div>
          )}

          <div className="text-xs text-slate-400 space-y-1">
            <div>Each lead is counted once per day, under the last status it was moved to that day. "Closed (all)" adds up every status marked "No follow-up needed" in Settings{closing.length ? ` (${closing.join(", ")})` : ""}.</div>
            <div>
              {isAdmin
                ? "Staff tables count the status changes made by that person; new leads are the ones assigned to them. The whole-team table also includes changes made by Admin."
                : "Status counts are the changes you made; new leads are the ones assigned to you."}
              {" "}Total adds up the days shown.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
