"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Lead, Profile, todayStr, toLocalDateStr, dayDiff, fmtDate, addDaysStr, localRangeToISO } from "@/lib/types";
import { classifyActivity } from "@/lib/activity";
import { fetchAllRows } from "@/lib/fetchAll";
import { StatCard, Badge, statusDotColor } from "@/components/ui";
import { Users, ClipboardList, AlertTriangle, CalendarClock, Clock, Inbox, CheckCircle2, TrendingUp, FileText, BadgeCheck } from "lucide-react";

const PRESETS: [string, string][] = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["last7", "Last 7 days"],
  ["last30", "Last 30 days"], ["month", "This month"], ["custom", "Custom"],
];

function rangeFor(preset: string) {
  const t = todayStr();
  switch (preset) {
    case "yesterday": { const y = addDaysStr(t, -1); return { from: y, to: y }; }
    case "last7": return { from: addDaysStr(t, -6), to: t };
    case "last30": return { from: addDaysStr(t, -29), to: t };
    case "month": return { from: t.slice(0, 8) + "01", to: t };
    default: return { from: t, to: t };
  }
}

export default function StaffReportsPage() {
  const supabase = createClient();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [acts, setActs] = useState<any[]>([]);
  const [actsLoading, setActsLoading] = useState(false);
  const [preset, setPreset] = useState("today");
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [selectedId, setSelectedId] = useState("");

  // Load staff, leads and statuses once (Admin only)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setReady(true); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "admin") { setReady(true); return; }
      setIsAdmin(true);
      const { data: staffRows } = await supabase.from("profiles").select("*").eq("role", "staff").order("full_name");
      setStaff(staffRows || []);
      if (staffRows && staffRows.length) setSelectedId(staffRows[0].id);
      const leadRows = await fetchAllRows<Lead>((a, b) =>
        supabase.from("leads").select("*").order("created_at", { ascending: false }).order("id").range(a, b));
      setLeads(leadRows);
      const { data: statusRows } = await supabase.from("lead_statuses").select("name").order("sort_order");
      setStatuses((statusRows || []).map((s: any) => s.name));
      setReady(true);
    })();
  }, []);

  // Reload the activity log whenever the date range changes
  useEffect(() => {
    if (!isAdmin) return;
    if (from > to) { setActs([]); return; }
    let cancelled = false;
    (async () => {
      setActsLoading(true);
      const { startISO, endISO } = localRangeToISO(from, to);
      const rows = await fetchAllRows<any>((a, b) =>
        supabase.from("lead_activities")
          .select("id, lead_id, actor_id, actor_name, activity_type, detail, created_at")
          .gte("created_at", startISO).lt("created_at", endISO)
          .order("created_at", { ascending: false }).order("id").range(a, b));
      if (!cancelled) { setActs(rows); setActsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, from, to]);

  function choosePreset(p: string) {
    setPreset(p);
    if (p !== "custom") { const r = rangeFor(p); setFrom(r.from); setTo(r.to); }
  }

  if (!ready) return <div className="text-slate-500 text-sm">Loading…</div>;
  if (!isAdmin) return <div className="text-sm text-red-600">Staff reports are Admin-only.</div>;
  if (!staff.length) return <div className="text-sm text-slate-500">No staff accounts yet. Add staff in Settings first.</div>;

  const today = todayStr();
  const rangeInvalid = from > to;
  const periodLabel = from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`;
  const leadById = Object.fromEntries(leads.map((l) => [l.id, l]));

  // One metrics object per staff member
  const metrics = staff.map((s) => {
    const mine = leads.filter((l) => l.assigned_staff_id === s.id);
    const active = mine.filter((l) => !l.converted && l.status !== "Not Interested");
    const myActs = acts.filter((a) => a.actor_id === s.id);
    const flags = myActs.map((a) => classifyActivity(a.activity_type, a.detail));
    const count = (k: "note" | "status" | "followupSet" | "followupDone") => flags.filter((f) => f[k]).length;
    return {
      staff: s,
      mine,
      assigned: mine.length,
      active: active.length,
      converted: mine.filter((l) => l.converted).length,
      overdue: mine.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) < 0).length,
      dueToday: mine.filter((l) => l.next_followup_date === today).length,
      upcoming: mine.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) > 0).length,
      noFollowup: active.filter((l) => !l.next_followup_date).length,
      newLeads: mine.filter((l) => { const d = toLocalDateStr(l.created_at); return d >= from && d <= to; }).length,
      attendedIds: new Set(myActs.map((a) => a.lead_id)),
      attended: new Set(myActs.map((a) => a.lead_id)).size,
      notes: count("note"),
      statusUpdates: count("status"),
      followupsSet: count("followupSet"),
      followupsDone: count("followupDone"),
      myActs,
    };
  });

  const totals = {
    assigned: metrics.reduce((n, m) => n + m.assigned, 0),
    overdue: metrics.reduce((n, m) => n + m.overdue, 0),
    dueToday: metrics.reduce((n, m) => n + m.dueToday, 0),
    newLeads: metrics.reduce((n, m) => n + m.newLeads, 0),
    // a lead touched by two staff is counted once in the team total
    attended: new Set(metrics.flatMap((m) => Array.from(m.attendedIds))).size,
    notes: metrics.reduce((n, m) => n + m.notes, 0),
    statusUpdates: metrics.reduce((n, m) => n + m.statusUpdates, 0),
    followupsSet: metrics.reduce((n, m) => n + m.followupsSet, 0),
    followupsDone: metrics.reduce((n, m) => n + m.followupsDone, 0),
  };

  const sel = metrics.find((m) => m.staff.id === selectedId) || metrics[0];
  const sid = sel.staff.id;
  const th = "text-left px-3 py-2.5 font-medium text-slate-500 whitespace-nowrap";
  const td = "px-3 py-2.5 whitespace-nowrap";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-ink mb-3">Staff reports</h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => choosePreset(k)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${preset === k ? "bg-navy text-white border-navy" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2 text-sm mt-3">
            <input type="date" max={today} value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="border border-slate-200 rounded-md px-3 py-1.5 bg-white" />
            <span className="text-slate-400">to</span>
            <input type="date" max={today} value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="border border-slate-200 rounded-md px-3 py-1.5 bg-white" />
          </div>
        )}
        <div className="text-xs text-slate-500 mt-3">
          {rangeInvalid
            ? <span className="text-red-600">The start date is after the end date. Please fix the range.</span>
            : <>Activity shown for <b>{periodLabel}</b>{actsLoading ? " (updating…)" : ""}. Lead counts such as assigned and overdue always show the current position.</>}
        </div>
      </div>

      {/* Team overview */}
      <div>
        <div className="text-sm font-semibold mb-3 text-ink">Team overview</div>
        <div className="rounded-lg border border-slate-200 overflow-x-auto bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className={th}>Staff</th>
                <th className={th}>Assigned now</th>
                <th className={th}>Overdue now</th>
                <th className={th}>Due today</th>
                <th className={th}>New leads</th>
                <th className={th}>Leads attended</th>
                <th className={th}>Notes</th>
                <th className={th}>Status updates</th>
                <th className={th}>Follow-ups set</th>
                <th className={th}>Follow-ups done</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr
                  key={m.staff.id}
                  onClick={() => setSelectedId(m.staff.id)}
                  className={`border-t border-slate-200 cursor-pointer hover:bg-slate-50 ${m.staff.id === sid ? "bg-indigo-50/60" : ""}`}
                >
                  <td className={td + " font-medium text-ink"}>{m.staff.full_name}{!m.staff.active && <span className="ml-2"><Badge tone="red">Inactive</Badge></span>}</td>
                  <td className={td}>{m.assigned}</td>
                  <td className={td + (m.overdue ? " text-rose-700 font-semibold" : "")}>{m.overdue}</td>
                  <td className={td}>{m.dueToday}</td>
                  <td className={td}>{m.newLeads}</td>
                  <td className={td + " font-semibold"}>{m.attended}</td>
                  <td className={td}>{m.notes}</td>
                  <td className={td}>{m.statusUpdates}</td>
                  <td className={td}>{m.followupsSet}</td>
                  <td className={td}>{m.followupsDone}</td>
                </tr>
              ))}
              {staff.length > 1 && (
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-ink">
                  <td className={td}>Team total</td>
                  <td className={td}>{totals.assigned}</td>
                  <td className={td}>{totals.overdue}</td>
                  <td className={td}>{totals.dueToday}</td>
                  <td className={td}>{totals.newLeads}</td>
                  <td className={td}>{totals.attended}</td>
                  <td className={td}>{totals.notes}</td>
                  <td className={td}>{totals.statusUpdates}</td>
                  <td className={td}>{totals.followupsSet}</td>
                  <td className={td}>{totals.followupsDone}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-slate-400 mt-2">
          "Leads attended" counts each lead once per person, even if they updated it several times. Tap a row to open that person's full report below.
        </div>
      </div>

      {/* Individual report */}
      <div>
        <div className="text-sm font-semibold mb-3 text-ink">Individual report</div>
        <div className="flex flex-wrap gap-2 mb-5">
          {staff.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`px-3.5 py-2 rounded-md text-sm font-medium border transition ${s.id === sid ? "bg-navy text-white border-navy" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              {s.full_name}
            </button>
          ))}
        </div>

        <div className="text-xs font-medium text-slate-500 mb-2">{sel.staff.full_name}: current workload</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <StatCard label="Leads assigned" value={sel.assigned} tone="blue" icon={ClipboardList} link={`/leads?staffId=${sid}`} />
          <StatCard label="Still active" value={sel.active} tone="blue" icon={TrendingUp} link={`/leads?staffId=${sid}&special=active`} />
          <StatCard label="Overdue follow-ups" value={sel.overdue} tone="red" icon={AlertTriangle} link={`/followups?staffId=${sid}&tab=overdue`} />
          <StatCard label="Due today" value={sel.dueToday} tone="brass" icon={CalendarClock} link={`/followups?staffId=${sid}&tab=today`} />
          <StatCard label="Upcoming" value={sel.upcoming} icon={Clock} link={`/followups?staffId=${sid}&tab=upcoming`} />
          <StatCard label="Active, no follow-up set" value={sel.noFollowup} tone="brass" icon={CalendarClock} link={`/followups?staffId=${sid}&tab=none`} />
        </div>

        <div className="text-xs font-medium text-slate-500 mb-2">{sel.staff.full_name}: activity for {periodLabel}</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <StatCard label="New leads received" value={sel.newLeads} tone="blue" icon={Inbox} />
          <StatCard label="Leads attended" value={sel.attended} tone="green" icon={BadgeCheck} />
          <StatCard label="Notes added" value={sel.notes} icon={FileText} />
          <StatCard label="Status updates" value={sel.statusUpdates} tone="violet" icon={TrendingUp} />
          <StatCard label="Follow-ups set" value={sel.followupsSet} tone="brass" icon={CalendarClock} />
          <StatCard label="Follow-ups completed" value={sel.followupsDone} tone="green" icon={CheckCircle2} />
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-2">Leads by status</div>
            <div className="rounded-lg border border-slate-200 bg-white p-2">
              {statuses
                .map((st) => ({ name: st, n: sel.mine.filter((l) => l.status === st).length }))
                .filter((r) => r.n > 0)
                .map((r) => (
                  <Link key={r.name} href={`/leads?staffId=${sid}&status=${encodeURIComponent(r.name)}`}
                    className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 border-slate-100 hover:bg-slate-50">
                    <span className="text-sm text-ink flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${statusDotColor(r.name)}`} />
                      {r.name}
                    </span>
                    <span className="text-sm font-semibold text-navy3">{r.n}</span>
                  </Link>
                ))}
              {!sel.assigned && <div className="px-3 py-3 text-sm text-slate-400">No leads assigned.</div>}
            </div>
            <div className="text-xs text-slate-400 mt-2">Converted to clients: <b className="text-ink">{sel.converted}</b></div>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-medium text-slate-500 mb-2">
              What {sel.staff.full_name} did ({sel.myActs.length} {sel.myActs.length === 1 ? "action" : "actions"}{sel.myActs.length > 25 ? ", latest 25 shown" : ""})
            </div>
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              {sel.myActs.slice(0, 25).map((a) => {
                const l = leadById[a.lead_id];
                return (
                  <Link key={a.id} href={`/leads/${a.lead_id}`} className="block px-4 py-3 border-b last:border-b-0 border-slate-100 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-medium text-ink">
                        {l ? (l.name?.trim() ? l.name : <span className="text-amber-600 italic">Name pending</span>) : "Lead"}
                        {l && <span className="text-xs font-normal text-slate-400"> · {l.lead_code}</span>}
                      </span>
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {new Date(a.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{a.activity_type}</div>
                    {a.detail && <div className="text-xs text-slate-600 mt-0.5 break-words">{a.detail}</div>}
                  </Link>
                );
              })}
              {!sel.myActs.length && (
                <div className="px-4 py-6 text-sm text-center text-slate-400">
                  {rangeInvalid ? "Fix the date range to see activity." : `No activity recorded for ${periodLabel}.`}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
