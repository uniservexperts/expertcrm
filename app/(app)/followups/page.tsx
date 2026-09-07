"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Lead, todayStr, dayDiff, followUpLabel, followUpTone } from "@/lib/types";
import { Badge } from "@/components/ui";

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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activityLeadIds, setActivityLeadIds] = useState<Set<string>>(new Set());
  const [latestNotes, setLatestNotes] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("today");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: leadRows } = await supabase.from("leads").select("*").order("next_followup_date");
      setLeads(leadRows || []);
      const { data: completedActs } = await supabase.from("lead_activities").select("lead_id").eq("activity_type", "Follow-up completed");
      setActivityLeadIds(new Set((completedActs || []).map((a) => a.lead_id)));
      const { data: noteRows } = await supabase.from("lead_activities").select("lead_id, detail, created_at").eq("activity_type", "Note added").order("created_at", { ascending: false });
      const noteMap: Record<string, string> = {};
      (noteRows || []).forEach((r: any) => {
        if (!(r.lead_id in noteMap) && r.detail && r.detail.trim()) noteMap[r.lead_id] = r.detail.trim();
      });
      setLatestNotes(noteMap);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;

  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const CLOSING_STATUSES = ["Not Interested"];
  const isClosed = (l: Lead) => CLOSING_STATUSES.includes(l.status);
  const buckets: Record<string, Lead[]> = {
    today: leads.filter((l) => l.next_followup_date === today),
    tomorrow: leads.filter((l) => l.next_followup_date === tomorrow),
    upcoming: leads.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) > 1),
    overdue: leads.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) < 0),
    none: leads.filter((l) => !l.next_followup_date && !l.converted && !isClosed(l)),
    completed: leads.filter((l) => activityLeadIds.has(l.id)),
  };
  const tabs: [string, string][] = [["today", "Today"], ["tomorrow", "Tomorrow"], ["upcoming", "Upcoming"], ["overdue", "Overdue"], ["none", "No follow-up"], ["completed", "Completed"]];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4 text-ink">Follow-up Center</h2>
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3.5 py-2 text-sm font-medium relative ${tab === k ? "text-navy" : "text-slate-400"}`}>
            {label} ({buckets[k].length})
            {tab === k && <div className="absolute left-0 right-0 -bottom-px h-0.5 bg-navy" />}
          </button>
        ))}
      </div>
      {!buckets[tab].length ? (
        <div className="text-sm p-6 text-center rounded-lg bg-white border border-slate-200 text-slate-400">Nothing here.</div>
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50">
              <th className="text-left px-4 py-2.5 font-medium text-slate-500">Lead</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-500">Status</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-500">Last call note</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-500">Follow-up</th>
              <th></th>
            </tr></thead>
            <tbody>
              {buckets[tab].map((l) => (
                <tr key={l.id} className="border-t border-slate-200">
                  <td className="px-4 py-2.5"><div className="font-medium text-ink">{l.name?.trim() ? l.name : <span className="text-amber-600 italic">Name pending</span>}</div><div className="text-xs text-slate-400">{l.lead_code} · {l.mobile}</div></td>
                  <td className="px-4 py-2.5"><Badge>{l.status}</Badge></td>
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
      )}
    </div>
  );
}
