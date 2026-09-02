"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, inputCls } from "@/components/ui";

export default function SettingsPage() {
  const supabase = createClient();
  const [countries, setCountries] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [newCountry, setNewCountry] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [newStaff, setNewStaff] = useState({ full_name: "", email: "", password: "" });
  const [staffErr, setStaffErr] = useState("");
  const [staffMsg, setStaffMsg] = useState("");
  const [denied, setDenied] = useState(false);

  async function load() {
    const { data: c, error } = await supabase.from("countries").select("*").order("name");
    if (error) { setDenied(true); return; }
    setCountries(c || []);
    const { data: s } = await supabase.from("lead_statuses").select("*").order("sort_order");
    setStatuses(s || []);
    const { data: st } = await supabase.from("profiles").select("*").eq("role", "staff");
    setStaff(st || []);
  }
  useEffect(() => { load(); }, []);

  if (denied) return <div className="text-sm text-red-600">Settings are Admin-only.</div>;

  async function addCountry() {
    if (!newCountry.trim()) return;
    await supabase.from("countries").insert({ name: newCountry.trim() });
    setNewCountry(""); load();
  }
  async function addStatus() {
    if (!newStatus.trim()) return;
    await supabase.from("lead_statuses").insert({ name: newStatus.trim(), sort_order: statuses.length + 1 });
    setNewStatus(""); load();
  }
  async function toggleStaff(s: any) {
    await supabase.from("profiles").update({ active: !s.active }).eq("id", s.id);
    load();
  }
  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    setStaffErr(""); setStaffMsg("");
    const res = await fetch("/api/admin/create-staff", { method: "POST", body: JSON.stringify(newStaff) });
    const data = await res.json();
    if (!res.ok) { setStaffErr(data.error); return; }
    setStaffMsg(`Staff account created for ${data.full_name}.`);
    setNewStaff({ full_name: "", email: "", password: "" });
    load();
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h2 className="text-lg font-semibold text-ink">Settings</h2>

      <div>
        <div className="text-sm font-semibold mb-3 text-ink">Staff members</div>
        <div className="rounded-lg border border-slate-200 divide-y mb-3 bg-white">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>{s.full_name}</span>
              <div className="flex items-center gap-2">
                <Badge tone={s.active ? "green" : "red"}>{s.active ? "Active" : "Inactive"}</Badge>
                <Btn variant="ghost" onClick={() => toggleStaff(s)}>{s.active ? "Deactivate" : "Activate"}</Btn>
              </div>
            </div>
          ))}
          {!staff.length && <div className="px-4 py-3 text-sm text-slate-400">No staff accounts yet — add one below.</div>}
        </div>
        <form onSubmit={addStaff} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input placeholder="Full name" required className={inputCls} value={newStaff.full_name} onChange={(e) => setNewStaff({ ...newStaff, full_name: e.target.value })} />
          <input placeholder="Email" type="email" required className={inputCls} value={newStaff.email} onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })} />
          <input placeholder="Temporary password" required className={inputCls} value={newStaff.password} onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })} />
          <Btn type="submit" className="sm:col-span-3 justify-center">Create staff account</Btn>
        </form>
        {staffErr && <div className="text-xs text-red-600 mt-2">{staffErr}</div>}
        {staffMsg && <div className="text-xs text-emerald-600 mt-2">{staffMsg}</div>}
      </div>

      <div>
        <div className="text-sm font-semibold mb-3 text-ink">Countries</div>
        <div className="flex flex-wrap gap-2 mb-3">{countries.map((c) => <Badge key={c.id}>{c.name}</Badge>)}</div>
        <div className="flex gap-2"><input placeholder="Add country" className={inputCls} value={newCountry} onChange={(e) => setNewCountry(e.target.value)} /><Btn onClick={addCountry}>Add</Btn></div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-3 text-ink">Lead statuses</div>
        <div className="flex flex-wrap gap-2 mb-3">{statuses.map((s) => <Badge key={s.id}>{s.name}</Badge>)}</div>
        <div className="flex gap-2"><input placeholder="Add status" className={inputCls} value={newStatus} onChange={(e) => setNewStatus(e.target.value)} /><Btn onClick={addStatus}>Add</Btn></div>
      </div>
    </div>
  );
}
