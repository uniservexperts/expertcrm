"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayStr, dayDiff, DOC_KEYS, LEAD_SOURCES } from "@/lib/types";
import { StatCard } from "@/components/ui";

const CLOSING_STATUSES = ["Not Interested", "Cancelled", "No Response"];

export default function ReportsPage() {
  const supabase = createClient();
  const [leads, setLeads] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: leadRows, error } = await supabase.from("leads").select("*");
      if (error) { setDenied(true); setLoading(false); return; }
      setLeads(leadRows || []);
      const { data: clientRows } = await supabase.from("clients").select("*, client_documents(*), payments(*), refunds(*)");
      setClients(clientRows || []);
      const { data: staffRows } = await supabase.from("profiles").select("*").eq("role", "staff");
      setStaff(staffRows || []);
      const { data: countryRows } = await supabase.from("countries").select("*");
      setCountries(countryRows || []);
      const { data: statusRows } = await supabase.from("lead_statuses").select("name").order("sort_order");
      setStatuses((statusRows || []).map((s) => s.name));
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;
  if (denied) return <div className="text-sm text-red-600">Reports are Admin-only.</div>;

  const byStaff = staff.map((s) => ({ name: s.full_name, n: leads.filter((l) => l.assigned_staff_id === s.id).length }));
  const byCountry = countries.map((c) => ({ name: c.name, n: leads.filter((l) => l.country_id === c.id).length }));
  const bySource = LEAD_SOURCES.map((s) => ({ name: s, n: leads.filter((l) => l.source === s).length }));
  const byStatus = statuses.map((s) => ({ name: s, n: leads.filter((l) => l.status === s).length })).filter((r) => r.n > 0);
  const closedCount = leads.filter((l) => CLOSING_STATUSES.includes(l.status)).length;
  const balance = (c: any) => c.total_fee - (c.payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const docsPending = (c: any) => DOC_KEYS.some(([k]) => !c.client_documents?.find((d: any) => d.doc_key === k)?.received);

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold text-ink">Reports</h2>

      <div>
        <div className="text-sm font-semibold mb-3 text-ink">Leads</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Total leads" value={leads.length} />
          <StatCard label="Converted" value={leads.filter((l) => l.converted).length} tone="green" />
          <StatCard label="Closed (no follow-up)" value={closedCount} tone="red" />
          <StatCard label="Still active" value={leads.length - leads.filter((l) => l.converted).length - closedCount} tone="blue" />
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          <ReportTable title="By staff" rows={byStaff} />
          <ReportTable title="By country" rows={byCountry} />
          <ReportTable title="By source" rows={bySource} />
          <ReportTable title="By status" rows={byStatus} />
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-3 text-ink">Follow-ups</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Today" value={leads.filter((l) => l.next_followup_date === todayStr()).length} />
          <StatCard label="Overdue" value={leads.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) < 0).length} tone="red" />
          <StatCard label="Upcoming" value={leads.filter((l) => l.next_followup_date && dayDiff(l.next_followup_date) > 0).length} />
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-3 text-ink">Clients</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Active clients" value={clients.length} />
          <StatCard label="Docs pending" value={clients.filter(docsPending).length} tone="brass" />
          <StatCard label="Payments pending" value={clients.filter((c) => balance(c) > 0).length} tone="red" />
          <StatCard label="Refund pending" value={clients.filter((c: any) => c.refunds?.[0]?.applicable && c.refunds?.[0]?.status !== "Paid").length} tone="red" />
        </div>
      </div>
    </div>
  );
}

function ReportTable({ title, rows }: { title: string; rows: { name: string; n: number }[] }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 bg-white">
      <div className="text-xs font-medium mb-2 text-slate-500">{title}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex justify-between text-sm py-1"><span className="text-ink">{r.name}</span><span className="text-slate-400">{r.n}</span></div>
      ))}
    </div>
  );
}
