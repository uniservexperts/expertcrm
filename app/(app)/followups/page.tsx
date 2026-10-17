"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Lead, Profile, Scope, inScope, todayStr, dayDiff, followUpLabel, followUpTone, buildLatestNoteMap } from "@/lib/types";
import { Badge, PhoneLink, ScopeToggle } from "@/components/ui";
import { useScope } from "@/lib/useScope";
import { useTeamSharing } from "@/lib/useTeamSharing";

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function FollowUpCenterPage() {
  const supabase = createClient();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activityLeadIds, setActivityLeadIds] = useState<Set<string>>(new Set());
  const [latestNotes, setLatestNotes] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("today");
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Profile | null>(null);
  const [allStaff, setAllStaff] = useState<Profile[]>([]);
  const sharing = useTeamSharing();
  const [scope, setScope] = useScope();
  const [staffFilter, setStaffFilter] = useState<string | null>(null);

  // Links from the Admin's Staff Reports page open this screen pre-filtered
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const sid = p.get("staffId");
      const t = p.get("tab");
      if (sid) setStaffFilter(sid);
      if (t && ["today", "tomorrow", "upcoming", "overdue", "none", "completed"].includes(t)) setTab(t);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
        setMe(profile);
      }
      const { data: staffRows } = await supabase.from("profiles").select("*").eq("role", "staff");
      setAllStaff(staffRows || []);
      const { data: leadRows } = await supabase.from("leads").select("*").order("next_followup_date");
      setLeads(leadRows || []);
      const { data: completedActs } = await supabase.from("lead_activities").select("lead_id").eq("activity_type", "Follow-up completed");
      setActivityLeadIds(new Set((completedActs || []).map((a) => a.lead_id)));
      const { data: noteRows } = await supabase.from("lead_activities").select("lead_id, activity_type, detail, created_at").in("activity_type", ["Note added", "Lead updated"]).order("created_at", { ascending: false });
      setLatestNotes(buildLatestNoteMap(noteRows || []));
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;

  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const CLOSING_STATUSES = ["Not Interested"];
  const isClosed = (l: Lead) => CLOSING_STATUSES.includes(l.status);
  const isAdmin = me?.role === "admin";
  // Staff see their own follow-ups by default; with team sharing on they can switch to colleagues'
  const effectiveScope: Scope = isAdmin ? "all" : sharing ? scope : "mine";
  const scopedByRole = me ? leads.filter((l) => inScope(l.assigned_staff_id, effectiveScope, me.id)) : leads;
  const scoped = staffFilter ? scopedByRole.filter((l) => l.assigned_staff_id === staffFilter) : scopedByRole;
  const showAssigned = isAdmin || (sharing && effectiveScope !== "mine");
  const staffName = (id: string | null) => allStaff.find((s) => s.id === id)?.full_name || "Unassigned";
  const buckets: Record<string, Lead[]> = {
    today: scoped.filter((l) => l.next_followup_date === today),
    tomorrow: scoped.filter((l) => l.next_followup_date === tomorrow),
    upcoming: scoped.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) > 1),
    overdue: scoped.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) < 0),
    none: scoped.filter((l) => !l.next_followup_date && !l.converted && !isClosed(l)),
    completed: scoped.filter((l) => activityLeadIds.has(l.id)),
  };
  const tabs: [string, string][] = [["today", "Today"], ["tomorrow", "Tomorrow"], ["upcoming", "Upcoming"], ["overdue", "Overdue"], ["none", "No follow-up"], ["completed", "Completed"]];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3 text-ink">Follow-up Center</h2>
      {staffFilter && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-slate-500">Filtered by:</span>
          <Badge tone="blue">Staff: {staffName(staffFilter)}</Badge>
          <button type="button" onClick={() => setStaffFilter(null)} className="text-xs text-navy3 underline">Clear filter</button>
        </div>
      )}
      {!isAdmin && sharing && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ScopeToggle value={effectiveScope} onChange={setScope} />
          {effectiveScope !== "mine" && (
            <span className="text-xs text-slate-500">Free to help? Open a colleague's lead and log your call. It's recorded under your name.</span>
          )}
        </div>
      )}
      <div className="flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto whitespace-nowrap">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3.5 py-2 text-sm font-medium relative flex-shrink-0 ${tab === k ? "text-navy" : "text-slate-400"}`}>
            {label} ({buckets[k].length})
            {tab === k && <div className="absolute left-0 right-0 -bottom-px h-0.5 bg-navy" />}
          </button>
        ))}
      </div>
      {!buckets[tab].length ? (
        <div className="text-sm p-6 text-center rounded-lg bg-white border border-slate-200 text-slate-400">Nothing here.</div>
      ) : (
        <>
          {/* Desktop/tablet: table */}
          <div className="hidden md:block rounded-lg border border-slate-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50">
                <th className="text-left px-4 py-2.5 font-medium text-slate-500">Lead</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500">Location</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500">Status</th>
                {showAssigned && <th className="text-left px-4 py-2.5 font-medium text-slate-500">Assigned</th>}
                <th className="text-left px-4 py-2.5 font-medium text-slate-500">Last call note</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500">Follow-up</th>
                <th></th>
              </tr></thead>
              <tbody>
                {buckets[tab].map((l) => (
                  <tr key={l.id} className="border-t border-slate-200">
                    <td className="px-4 py-2.5"><div className="font-medium text-ink">{l.name?.trim() ? l.name : <span className="text-amber-600 italic">Name pending</span>}</div><div className="text-xs text-slate-400 flex items-center gap-1">{l.lead_code} · <PhoneLink number={l.mobile} /></div></td>
                    <td className="px-4 py-2.5 text-slate-600">{l.location || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2.5"><Badge>{l.status}</Badge></td>
                    {showAssigned && <td className="px-4 py-2.5 text-slate-600">{staffName(l.assigned_staff_id)}</td>}
                    <td className="px-4 py-2.5 max-w-xs">
                      <div className="text-xs text-slate-600 whitespace-normal break-words line-clamp-2">
                        {latestNotes[l.id] || <span className="italic text-slate-400">No notes yet</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><Badge tone={followUpTone(l.next_followup_date)}>{followUpLabel(l.next_followup_date)}</Badge></td>
                    <td className="px-4 py-2.5 text-right"><Link href={`/leads/${l.id}`} className="text-xs font-medium text-navy3">Open →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards */}
          <div className="md:hidden space-y-2">
            {buckets[tab].map((l) => (
              <div key={l.id} onClick={() => router.push(`/leads/${l.id}`)}
                className="rounded-lg border border-slate-200 bg-white p-4 active:bg-slate-50">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="font-medium text-ink">{l.name?.trim() ? l.name : <span className="text-amber-600 italic">Name pending</span>}</div>
                  <Badge tone={followUpTone(l.next_followup_date)}>{followUpLabel(l.next_followup_date)}</Badge>
                </div>
                <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">{l.lead_code} · <PhoneLink number={l.mobile} /></div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge>{l.status}</Badge>
                  {l.location && <span className="text-xs text-slate-500">{l.location}</span>}
                  {showAssigned && <span className="text-xs text-slate-400">· {staffName(l.assigned_staff_id)}</span>}
                </div>
                <div className="text-xs text-slate-600 whitespace-normal break-words line-clamp-2">
                  {latestNotes[l.id] || <span className="italic text-slate-400">No notes yet</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
