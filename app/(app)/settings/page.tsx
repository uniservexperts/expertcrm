"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, inputCls, Field } from "@/components/ui";

export default function SettingsPage() {
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [countries, setCountries] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [newCountry, setNewCountry] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [newStaff, setNewStaff] = useState({ full_name: "", email: "", password: "" });
  const [staffErr, setStaffErr] = useState("");
  const [staffMsg, setStaffMsg] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const admin = profile?.role === "admin";
    setIsAdmin(admin);

    if (admin) {
      const { data: c } = await supabase.from("countries").select("*").order("name");
      setCountries(c || []);
      const { data: s } = await supabase.from("lead_statuses").select("*").order("sort_order");
      setStatuses(s || []);
      const { data: st } = await supabase.from("profiles").select("*").eq("role", "staff");
      setStaff(st || []);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr(""); setPwMsg("");
    if (newPassword.length < 8) { setPwErr("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setPwErr("Passwords don't match."); return; }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);
    if (error) { setPwErr(error.message); return; }
    setPwMsg("Password updated. Use it next time you sign in on any device.");
    setNewPassword(""); setConfirmPassword("");
  }

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

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold mb-1 text-ink">Change your password</div>
        <div className="text-xs text-slate-500 mb-3">You're already signed in, so this doesn't need an email link — just set a new one directly.</div>
        <form onSubmit={changePassword} className="space-y-2 max-w-sm">
          <Field label="New password">
            <input type="password" required className={inputCls} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
          </Field>
          <Field label="Confirm new password">
            <input type="password" required className={inputCls} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </Field>
          {pwErr && <div className="text-xs text-red-600">{pwErr}</div>}
          {pwMsg && <div className="text-xs text-emerald-600">{pwMsg}</div>}
          <Btn type="submit" disabled={pwSaving}>{pwSaving ? "Saving…" : "Update password"}</Btn>
        </form>
      </div>

      {isAdmin && (
        <>
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
        </>
      )}
    </div>
  );
}
