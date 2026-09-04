"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { todayStr, dayDiff, DOC_KEYS, LEAD_SOURCES } from "@/lib/types";
import { StatCard } from "@/components/ui";

const CLOSING_STATUSES = ["Not Interested"];

export default function ReportsPage() {
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      const admin = profile?.role === "admin";
      setIsAdmin(admin);

      const { data: leadRows } = await supabase.from("leads").select("*");
      setLeads(leadRows || []);
      const { data: countryRows } = await supabase.from("countries").select("*");
      setCountries(countryRows || []);
      const { data: statusRows } = await supabase.from("lead_statuses").select("name").order("sort_order");
      setStatuses((statusRows || []).map((s) => s.name));

      if (admin) {
        const { data: clientRows } = await supabase.from("clients").select("*, client_documents(*), payments(*), refunds(*)");
        setClients(clientRows || []);
        const { data: staffRows } = await supabase.from("profiles").select("*").eq("role", "staff");
        setStaff(staffRows || []);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;

  const byStaff = staff.map((s) => ({ name: s.full_name, n: leads.filter((l) => l.assigned_staff_id === s.id).length, link: `/leads?staffId=${s.id}` }));
  const byCountry = countries.map((c) => ({ name: c.name, n: leads.filter((l) => l.country_id === c.id).length, link: `/leads?countryId=${c.id}` }));
  const bySource = LEAD_SOURCES.map((s) => ({ name: s, n: leads.filter((l) => l.source === s).length, link: `/leads?source=${encodeURIComponent(s)}` }));
  const byStatus = statuses.map((s) => ({ name: s, n: leads.filter((l) => l.status === s).length, link: `/leads?status=${encodeURIComponent(s)}` })).filter((r) => r.n > 0);
  const closedCount = leads.filter((l) => CLOSING_STATUSES.includes(l.status)).length;
  const convertedCount = leads.filter((l) => l.converted).length;
  const activeCount = leads.length - convertedCount - closedCount;
  const balance = (c: any) => c.total_fee - (c.payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const docsPending = (c: any) => DOC_KEYS.some(([k]) => !c.client_documents?.find((d: any) => d.doc_key === k)?.received);

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold text-ink">{isAdmin ? "Reports" : "My reports"}</h2>

      <div>
        <div className="text-sm font-semibold mb-3 text-ink">Leads</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Total leads" value={leads.length} link="/leads" />
          <StatCard label="Converted" value={convertedCount} tone="green" link="/leads?special=converted" />
          <StatCard label="Closed (no follow-up)" value={closedCount} tone="red" link="/leads?special=closed" />
          <StatCard label="Still active" value={activeCount} tone="blue" link="/leads?special=active" />
        </div>
        <div className={`grid ${isAdmin ? "md:grid-cols-4" : "md:grid-cols-3"} gap-4`}>
          {isAdmin && <ReportTable title="By staff" rows={byStaff} />}
          <ReportTable title="By country" rows={byCountry} />
          <ReportTable title="By source" rows={bySource} />
          <ReportTable title="By status" rows={byStatus} />
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-3 text-ink">Follow-ups</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Today" value={leads.filter((l) => l.next_followup_date === todayStr()).length} link="/followups" />
          <StatCard label="Overdue" value={leads.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) < 0).length} tone="red" link="/followups" />
          <StatCard label="Upcoming" value={leads.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) > 0).length} link="/followups" />
        </div>
      </div>

      {isAdmin && (
        <div>
          <div className="text-sm font-semibold mb-3 text-ink">Clients</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Active clients" value={clients.length} link="/clients" />
            <StatCard label="Docs pending" value={clients.filter(docsPending).length} tone="brass" link="/clients" />
            <StatCard label="Payments pending" value={clients.filter((c) => balance(c) > 0).length} tone="red" link="/clients" />
            <StatCard label="Refund pending" value={clients.filter((c: any) => c.refunds?.[0]?.applicable && c.refunds?.[0]?.status !== "Paid").length} tone="red" link="/clients" />
          </div>
        </div>
      )}
    </div>
  );
}

function ReportTable({ title, rows }: { title: string; rows: { name: string; n: number; link?: string }[] }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 bg-white">
      <div className="text-xs font-medium mb-2 text-slate-500">{title}</div>
      {rows.map((r) =>
        r.link ? (
          <Link key={r.name} href={r.link} className="flex justify-between text-sm py-1 hover:bg-slate-50 rounded px-1 -mx-1">
            <span className="text-ink">{r.name}</span><span className="text-navy3 font-medium">{r.n}</span>
          </Link>
        ) : (
          <div key={r.name} className="flex justify-between text-sm py-1"><span className="text-ink">{r.name}</span><span className="text-slate-400">{r.n}</span></div>
        )
      )}
      {!rows.length && <div className="text-sm text-slate-400 py-1">No data.</div>}
    </div>
  );
}
