"use client";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Lead, Profile, followUpLabel, followUpTone, LEAD_SOURCES, buildLatestNoteMap } from "@/lib/types";
import { Badge, Btn, Field, Modal, inputCls, PhoneLink } from "@/components/ui";

const CLOSING_STATUSES = ["Not Interested"];

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="text-slate-500 text-sm">Loading…</div>}>
      <LeadsPageInner />
    </Suspense>
  );
}

function LeadsPageInner() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<Profile | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staffOptions, setStaffOptions] = useState<Profile[]>([]);
  const [countries, setCountries] = useState<{ id: number; name: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "all");
  const [showNew, setShowNew] = useState(false);
  const [dup, setDup] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [latestNotes, setLatestNotes] = useState<Record<string, string>>({});

  const staffIdParam = searchParams.get("staffId");
  const countryIdParam = searchParams.get("countryId");
  const sourceParam = searchParams.get("source");
  const specialParam = searchParams.get("special");
  const hasUrlFilter = !!(staffIdParam || countryIdParam || sourceParam || specialParam);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setMe(profile);
    const { data: leadRows } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    setLeads(leadRows || []);

    const { data: noteRows } = await supabase.from("lead_activities").select("lead_id, activity_type, detail, created_at").in("activity_type", ["Note added", "Lead updated"]).order("created_at", { ascending: false });
    setLatestNotes(buildLatestNoteMap(noteRows || []));

    if (profile?.role === "admin") {
      const { data: staffRows } = await supabase.from("profiles").select("*").eq("role", "staff").eq("active", true);
      setStaffOptions(staffRows || []);
    }
    const { data: countryRows } = await supabase.from("countries").select("*");
    setCountries(countryRows || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const staffMap = Object.fromEntries(staffOptions.map((s) => [s.id, s.full_name]));
  const countryMap = Object.fromEntries(countries.map((c) => [c.id, c.name]));
  const isAdmin = me?.role === "admin";
  const statuses = [...new Set(leads.map((l) => l.status))];

  let filtered = statusFilter === "all" ? leads : leads.filter((l) => l.status === statusFilter);
  if (staffIdParam) filtered = filtered.filter((l) => l.assigned_staff_id === staffIdParam);
  if (countryIdParam) filtered = filtered.filter((l) => l.country_id === Number(countryIdParam));
  if (sourceParam) filtered = filtered.filter((l) => l.source === sourceParam);
  if (specialParam === "converted") filtered = filtered.filter((l) => l.converted);
  if (specialParam === "closed") filtered = filtered.filter((l) => CLOSING_STATUSES.includes(l.status));
  if (specialParam === "active") filtered = filtered.filter((l) => !l.converted && !CLOSING_STATUSES.includes(l.status));

  const filterLabels: string[] = [];
  if (staffIdParam) filterLabels.push(`Staff: ${staffMap[staffIdParam] || staffIdParam}`);
  if (countryIdParam) filterLabels.push(`Country: ${countryMap[Number(countryIdParam)] || countryIdParam}`);
  if (sourceParam) filterLabels.push(`Source: ${sourceParam}`);
  if (specialParam === "converted") filterLabels.push("Converted leads");
  if (specialParam === "closed") filterLabels.push("Closed (Not Interested)");
  if (specialParam === "active") filterLabels.push("Still active leads");

  async function createLead(form: any) {
    const mobileDigits = form.mobile.replace(/\D/g, "");
    const { data: dupRows } = await supabase.rpc("find_duplicate_mobile", { p_mobile: mobileDigits });
    if (dupRows && dupRows.length) { setShowNew(false); setDup(dupRows[0]); return; }

    let assignedStaffId = form.assignedStaffId || null;
    if (isAdmin && form.autoAssign) {
      const counts = staffOptions.map((s) => ({ id: s.id, n: leads.filter((l) => l.assigned_staff_id === s.id).length }));
      counts.sort((a, b) => a.n - b.n);
      assignedStaffId = counts[0]?.id || null;
    }
    if (!isAdmin) assignedStaffId = me!.id;

    const { data: newLead, error } = await supabase.from("leads").insert({
      name: form.name.trim(), mobile: form.mobile, location: form.location || null, source: form.source,
      country_id: form.countryId, assigned_staff_id: assignedStaffId, created_by: me!.id,
    }).select().single();
    if (error) { alert(error.message); return; }

    await supabase.from("lead_activities").insert({
      lead_id: newLead.id, actor_id: me!.id, actor_name: me!.full_name,
      activity_type: "Lead created", detail: form.notes || "",
    });
    setShowNew(false);
    load();
  }

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h2 className="text-lg font-semibold text-ink">{isAdmin ? "All leads" : "My leads"}</h2>
        <div className="flex gap-2">
          <select className="border border-slate-200 rounded-md px-2.5 py-1.5 text-sm flex-1 sm:flex-none" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
          <Btn onClick={() => setShowNew(true)}>+ New lead</Btn>
        </div>
      </div>

      {hasUrlFilter && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-slate-500">Filtered by:</span>
          {filterLabels.map((l) => <Badge key={l} tone="blue">{l}</Badge>)}
          <Link href="/leads" className="text-xs text-navy3 underline">Clear filter</Link>
        </div>
      )}

      {!filtered.length ? (
        <div className="text-sm p-6 text-center rounded-lg bg-white border border-slate-200 text-slate-400">No leads found.</div>
      ) : (
        <>
          {/* Desktop/tablet: table */}
          <div className="hidden md:block rounded-lg border border-slate-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50">
                <th className="text-left px-4 py-2.5 font-medium text-slate-500">Lead</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500">Location</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500">Last call note</th>
                {isAdmin && <th className="text-left px-4 py-2.5 font-medium text-slate-500">Assigned</th>}
                <th className="text-left px-4 py-2.5 font-medium text-slate-500">Next follow-up</th>
                <th></th>
              </tr></thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-t border-slate-200">
                    <td className="px-4 py-2.5"><div className="font-medium text-ink">{l.name?.trim() ? l.name : <span className="text-amber-600 italic">Name pending</span>}</div><div className="text-xs text-slate-400 flex items-center gap-1">{l.lead_code} · <PhoneLink number={l.mobile} /></div></td>
                    <td className="px-4 py-2.5 text-slate-600">{l.location || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2.5"><Badge>{l.status}</Badge></td>
                    <td className="px-4 py-2.5 max-w-xs">
                      <div className="text-xs text-slate-600 whitespace-normal break-words line-clamp-2">
                        {latestNotes[l.id] || <span className="italic text-slate-400">No notes yet</span>}
                      </div>
                    </td>
                    {isAdmin && <td className="px-4 py-2.5">{staffMap[l.assigned_staff_id || ""] || "Unassigned"}</td>}
                    <td className="px-4 py-2.5"><Badge tone={followUpTone(l.next_followup_date)}>{followUpLabel(l.next_followup_date)}</Badge></td>
                    <td className="px-4 py-2.5 text-right"><Link href={`/leads/${l.id}`} className="text-xs font-medium text-navy3">Open →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards, easier to tap and scan than a squeezed table */}
          <div className="md:hidden space-y-2">
            {filtered.map((l) => (
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
                  {isAdmin && <span className="text-xs text-slate-400">· {staffMap[l.assigned_staff_id || ""] || "Unassigned"}</span>}
                </div>
                <div className="text-xs text-slate-600 whitespace-normal break-words line-clamp-2">
                  {latestNotes[l.id] || <span className="italic text-slate-400">No notes yet</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showNew && (
        <NewLeadModal isAdmin={!!isAdmin} staffOptions={staffOptions} countries={countries} onClose={() => setShowNew(false)} onCreate={createLead} />
      )}
      {dup && (
        <Modal title="Duplicate mobile number" onClose={() => setDup(null)}>
          <p className="text-sm text-slate-600 mb-4">
            A {dup.kind} with this mobile number already exists: <b>{dup.name}</b> ({dup.code}), owned by {dup.owner_name}. No new record was created.
          </p>
          <Btn onClick={() => setDup(null)}>Close</Btn>
        </Modal>
      )}
    </div>
  );
}

function NewLeadModal({ isAdmin, staffOptions, countries, onClose, onCreate }: any) {
  const othersCountry = countries.find((c: any) => c.name === "Others");
  const [form, setForm] = useState({ name: "", mobile: "", location: "", source: LEAD_SOURCES[0], countryId: othersCountry?.id ?? countries[0]?.id, assignedStaffId: "", autoAssign: isAdmin, notes: "" });
  const [err, setErr] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.mobile.trim()) { setErr("Mobile number is required."); return; }
    onCreate(form);
  }
  return (
    <Modal title="New lead" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Mobile number"><input className={inputCls} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} autoFocus /></Field>
        <Field label="Name (leave blank if not known yet — you can add it after the first call)">
          <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Location (optional)"><input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Country">
            <select className={inputCls} value={form.countryId} onChange={(e) => setForm({ ...form, countryId: Number(e.target.value) })}>
              {countries.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Lead source">
          <select className={inputCls} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        {isAdmin && (
          <div>
            <label className="flex items-center gap-2 text-xs mb-2 text-slate-500">
              <input type="checkbox" checked={form.autoAssign} onChange={(e) => setForm({ ...form, autoAssign: e.target.checked })} /> Auto-assign (round robin)
            </label>
            {!form.autoAssign && (
              <Field label="Assign to staff">
                <select className={inputCls} value={form.assignedStaffId} onChange={(e) => setForm({ ...form, assignedStaffId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {staffOptions.map((s: any) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </Field>
            )}
          </div>
        )}
        <Field label="Initial notes"><textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        {err && <div className="text-xs text-red-600">{err}</div>}
        <Btn type="submit" className="w-full justify-center">Create lead</Btn>
      </form>
    </Modal>
  );
}
