"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Lead, Client, Profile, todayStr, toLocalDateStr, dayDiff, followUpLabel, followUpTone, DOC_KEYS } from "@/lib/types";
import { StatCard, Badge, statusDotColor } from "@/components/ui";
import { Inbox, CalendarClock, AlertTriangle, Clock, Briefcase, FileText, IndianRupee, BadgeCheck, XCircle, ShieldAlert } from "lucide-react";

export default function DashboardPage() {
  const supabase = createClient();
  const [me, setMe] = useState<Profile | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [activitiesToday, setActivitiesToday] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setMe(profile);

      const { data: leadRows } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
      setLeads(leadRows || []);

      const { data: statusRows } = await supabase.from("lead_statuses").select("name").order("sort_order");
      setStatuses((statusRows || []).map((s) => s.name));

      if (profile?.role === "admin") {
        const { data: clientRows } = await supabase.from("clients").select("*, client_documents(*), payments(*), refunds(*)");
        setClients(clientRows || []);
        const { data: staffRows } = await supabase.from("profiles").select("*").eq("role", "staff");
        setStaff(staffRows || []);
        const { data: actRows } = await supabase.from("lead_activities").select("*").gte("created_at", todayStr());
        setActivitiesToday((actRows || []).filter((a) => toLocalDateStr(a.created_at) === todayStr()));
      }
      setLoading(false);
    })();
  }, []);

  if (loading || !me) return <div className="text-slate-500 text-sm">Loading…</div>;
  const isAdmin = me.role === "admin";
  const today = todayStr();

  const newLeads = leads.filter((l) => toLocalDateStr(l.created_at) === today).length;
  const dueToday = leads.filter((l) => l.next_followup_date === today).length;
  const overdue = leads.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) < 0).length;
  const upcoming = leads.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) > 0).length;
  const overdueLeads = leads.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) < 0).slice(0, 6);
  const todayLeads = leads.filter((l) => l.next_followup_date === today).slice(0, 6);

  const docsPending = (c: any) => DOC_KEYS.some(([k]) => !c.client_documents?.find((d: any) => d.doc_key === k)?.received);
  const balance = (c: any) => c.total_fee - (c.payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = me.full_name.split(" ")[0];
  const dateLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const insight =
    overdue > 0 ? `${overdue} overdue follow-up${overdue > 1 ? "s" : ""} need attention first.` :
    dueToday > 0 ? `${dueToday} follow-up${dueToday > 1 ? "s" : ""} due today.` :
    "You're all caught up on follow-ups — nice work.";

  return (
    <div className="space-y-8">
      <div className="rounded-2xl p-6 text-white" style={{ background: "linear-gradient(135deg, #141B2E 0%, #33409E 55%, #6D5BD0 100%)" }}>
        <div className="text-sm text-white/70">{dateLabel}</div>
        <div className="text-xl font-bold font-display mt-1">{greeting}, {firstName}</div>
        <div className="text-sm text-white/90 mt-2">{insight}</div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-3 text-ink">Today</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label={isAdmin ? "New leads" : "My new leads"} value={newLeads} tone="blue" link="/leads" icon={Inbox} />
          <StatCard label="Follow-ups today" value={dueToday} tone="brass" link="/followups" icon={CalendarClock} />
          <StatCard label="Overdue follow-ups" value={overdue} tone="red" link="/followups" icon={AlertTriangle} />
          <StatCard label="Upcoming follow-ups" value={upcoming} link="/followups" icon={Clock} />
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-3 text-ink">{isAdmin ? "All leads by status" : "My leads by status"}</div>
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          {statuses.map((s) => ({ name: s, n: leads.filter((l) => l.status === s).length })).filter((r) => r.n > 0).map((r) => (
            <Link key={r.name} href={`/leads?status=${encodeURIComponent(r.name)}`} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 border-slate-100 hover:bg-slate-50">
              <span className="text-sm text-ink flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${statusDotColor(r.name)}`} />
                {r.name}
              </span>
              <span className="text-sm font-semibold text-navy3">{r.n}</span>
            </Link>
          ))}
          {!leads.length && <div className="px-3 py-3 text-sm text-slate-400">No leads yet.</div>}
        </div>
      </div>

      {isAdmin && (
        <div>
          <div className="text-sm font-semibold mb-3 text-ink">Clients</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Active clients" value={clients.length} tone="violet" link="/clients" icon={Briefcase} />
            <StatCard label="Documents pending" value={clients.filter(docsPending).length} tone="brass" link="/clients" icon={FileText} />
            <StatCard label="Payments pending" value={clients.filter((c) => balance(c) > 0).length} tone="red" link="/clients" icon={IndianRupee} />
            <StatCard label="Pending with VFS" value={clients.filter((c) => c.visa_status === "Pending with VFS").length} link="/clients" icon={Clock} />
            <StatCard label="Approved" value={clients.filter((c) => c.visa_status === "Approved").length} tone="green" link="/clients" icon={BadgeCheck} />
            <StatCard label="Refused" value={clients.filter((c) => c.visa_status === "Refused").length} tone="red" link="/clients" icon={XCircle} />
            <StatCard label="Refund pending" value={clients.filter((c: any) => c.refunds?.[0]?.applicable && c.refunds?.[0]?.status !== "Paid").length} tone="red" link="/clients" icon={ShieldAlert} />
          </div>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-sm font-semibold mb-3 text-ink">Staff</div>
          <div className="rounded-lg overflow-hidden border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50">
                <th className="text-left px-4 py-2 font-medium text-slate-500">Staff</th>
                <th className="text-left px-4 py-2 font-medium text-slate-500">Assigned leads</th>
                <th className="text-left px-4 py-2 font-medium text-slate-500">Overdue</th>
              </tr></thead>
              <tbody>
                {staff.map((s) => {
                  const mine = leads.filter((l) => l.assigned_staff_id === s.id);
                  return (
                    <tr key={s.id} className="border-t border-slate-200">
                      <td className="px-4 py-2">{s.full_name}{!s.active && <Badge tone="red">Inactive</Badge>}</td>
                      <td className="px-4 py-2"><Link href={`/leads?staffId=${s.id}`} className="text-navy3 font-medium hover:underline">{mine.length}</Link></td>
                      <td className="px-4 py-2">{mine.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) < 0).length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-sm font-semibold mb-3 text-ink">Staff activity today</div>
          <div className="rounded-lg overflow-hidden border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50">
                <th className="text-left px-4 py-2 font-medium text-slate-500">Staff</th>
                <th className="text-left px-4 py-2 font-medium text-slate-500">New leads</th>
                <th className="text-left px-4 py-2 font-medium text-slate-500">Notes added</th>
                <th className="text-left px-4 py-2 font-medium text-slate-500">Status updates</th>
                <th className="text-left px-4 py-2 font-medium text-slate-500">Follow-ups set</th>
                <th className="text-left px-4 py-2 font-medium text-slate-500">Follow-ups completed</th>
                <th className="text-left px-4 py-2 font-medium text-slate-500">Leads attended (unique)</th>
              </tr></thead>
              <tbody>
                {staff.map((s) => {
                  const acts = activitiesToday.filter((a) => a.actor_id === s.id);
                  const count = (type: string) => acts.filter((a) => a.activity_type === type).length;
                  const uniqueLeads = new Set(acts.map((a) => a.lead_id)).size;
                  return (
                    <tr key={s.id} className="border-t border-slate-200">
                      <td className="px-4 py-2">{s.full_name}</td>
                      <td className="px-4 py-2">{count("Lead created")}</td>
                      <td className="px-4 py-2">{count("Note added")}</td>
                      <td className="px-4 py-2">{count("Status changed")}</td>
                      <td className="px-4 py-2">{count("Follow-up scheduled")}</td>
                      <td className="px-4 py-2">{count("Follow-up completed")}</td>
                      <td className="px-4 py-2 font-medium">{uniqueLeads}</td>
                    </tr>
                  );
                })}
                {!activitiesToday.length && (
                  <tr><td colSpan={7} className="px-4 py-3 text-center text-slate-400">No activity logged yet today.</td></tr>
                )}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-200">
              "Leads attended" counts each lead once per staff member today, even if it was created and its status updated in the same day — it's not a sum of the columns to the left.
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div className="text-sm font-semibold mb-3 text-ink">Overdue — needs attention</div>
          <MiniList leads={overdueLeads} empty="No overdue follow-ups." />
        </div>
        <div>
          <div className="text-sm font-semibold mb-3 text-ink">Due today</div>
          <MiniList leads={todayLeads} empty="Nothing due today." />
        </div>
      </div>
    </div>
  );
}

function MiniList({ leads, empty }: { leads: Lead[]; empty: string }) {
  if (!leads.length) return <div className="text-sm p-4 rounded-lg bg-white border border-slate-200 text-slate-400">{empty}</div>;
  return (
    <div className="rounded-lg border border-slate-200 divide-y bg-white">
      {leads.map((l) => (
        <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
          <div>
            <div className="text-sm font-medium text-ink">{l.name?.trim() ? l.name : <span className="text-amber-600 italic">Name pending</span>}</div>
            <div className="text-xs text-slate-400">{l.mobile}</div>
          </div>
          <Badge tone={followUpTone(l.next_followup_date)}>{followUpLabel(l.next_followup_date)}</Badge>
        </Link>
      ))}
    </div>
  );
}
