"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, inputCls, Field, Modal, statusDotColor } from "@/components/ui";
import { removeStatus, removeCountry } from "@/lib/lookups";
import { Trash2 } from "lucide-react";

type DeleteTarget = { kind: "status" | "country"; id: number; name: string; leadCount: number; clientCount: number };

// The system itself relies on these two statuses: new leads start as "New Lead",
// and converting a lead to a client sets "Confirmed Client".
const PROTECTED_STATUSES = ["New Lead", "Confirmed Client"];

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
  const [sharing, setSharing] = useState(false);
  const [sharingAvailable, setSharingAvailable] = useState(true);
  const [sharingMsg, setSharingMsg] = useState("");
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [closesAvailable, setClosesAvailable] = useState(true);
  const [newStatusCloses, setNewStatusCloses] = useState(false);
  const [listMsg, setListMsg] = useState("");
  const [del, setDel] = useState<DeleteTarget | null>(null);
  const [replacement, setReplacement] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
    const admin = profile?.role === "admin";
    setIsAdmin(admin);
    setMe({ id: user.id, name: profile?.full_name || "Admin" });

    if (admin) {
      const { data: c } = await supabase.from("countries").select("*").order("name");
      setCountries(c || []);
      const { data: s } = await supabase.from("lead_statuses").select("*").order("sort_order");
      setStatuses(s || []);
      setClosesAvailable(!s || !s.length || "closes_lead" in s[0]);
      const { data: st } = await supabase.from("profiles").select("*").eq("role", "staff");
      setStaff(st || []);
      const { data: sh, error: shErr } = await supabase.from("app_settings").select("value").eq("key", "staff_share_leads").maybeSingle();
      if (shErr) setSharingAvailable(false);
      else { setSharingAvailable(true); setSharing(sh?.value === "true"); }
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

  async function toggleSharing() {
    const next = !sharing;
    setSharingMsg("");
    const { error } = await supabase.from("app_settings").upsert({ key: "staff_share_leads", value: next ? "true" : "false" });
    if (error) { setSharingMsg(error.message); return; }
    setSharing(next);
    setSharingMsg(next ? "On: staff can now see and work on each other's leads." : "Off: staff see only their own leads again.");
  }

  async function addCountry() {
    const name = newCountry.trim();
    if (!name) return;
    if (countries.some((c) => c.name.toLowerCase() === name.toLowerCase())) { setListMsg(`"${name}" already exists.`); return; }
    const { error } = await supabase.from("countries").insert({ name });
    if (error) { setListMsg(error.message); return; }
    setNewCountry(""); setListMsg(""); load();
  }
  async function addStatus() {
    const name = newStatus.trim();
    if (!name) return;
    if (statuses.some((s) => s.name.toLowerCase() === name.toLowerCase())) { setListMsg(`"${name}" already exists.`); return; }
    const nextOrder = Math.max(0, ...statuses.map((s) => s.sort_order || 0)) + 1;
    const row: any = { name, sort_order: nextOrder };
    if (closesAvailable) row.closes_lead = newStatusCloses;
    const { error } = await supabase.from("lead_statuses").insert(row);
    if (error) { setListMsg(error.message); return; }
    setNewStatus(""); setNewStatusCloses(false); setListMsg(""); load();
  }

  // Turn "No follow-up needed" on/off for a status
  async function toggleCloses(st: any) {
    setListMsg("");
    const next = !st.closes_lead;
    const { error } = await supabase.from("lead_statuses").update({ closes_lead: next }).eq("id", st.id);
    if (error) { setListMsg(error.message); return; }
    let cleared = 0;
    if (next) {
      // leads already in this status shouldn't keep a follow-up date
      const { data } = await supabase.from("leads")
        .update({ next_followup_date: null, next_followup_type: null, next_followup_note: null, next_followup_reminder: false })
        .eq("status", st.name).not("next_followup_date", "is", null).select("id");
      cleared = data?.length || 0;
    }
    setListMsg(next
      ? `"${st.name}" now closes leads (no follow-up needed).${cleared ? ` ${cleared} existing follow-up date${cleared === 1 ? "" : "s"} cleared.` : ""}`
      : `"${st.name}" no longer closes leads.`);
    load();
  }

  // Step 1 of removing a status/country: see how many leads (and clients) use it
  async function askDelete(kind: "status" | "country", item: any) {
    setDelErr(""); setReplacement(""); setListMsg("");
    if (kind === "status") {
      const { count, error } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", item.name);
      if (error) { setListMsg(error.message); return; }
      setDel({ kind, id: item.id, name: item.name, leadCount: count || 0, clientCount: 0 });
    } else {
      const [l, c] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("country_id", item.id),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("country_id", item.id),
      ]);
      if (l.error || c.error) { setListMsg((l.error || c.error)!.message); return; }
      setDel({ kind, id: item.id, name: item.name, leadCount: l.count || 0, clientCount: c.count || 0 });
    }
  }

  // Step 2: move anything using it to the chosen replacement, then remove it
  async function confirmDelete() {
    if (!del || !me) return;
    const inUse = del.leadCount + del.clientCount > 0;
    if (inUse && !replacement) { setDelErr("Please choose where to move them first."); return; }
    setDelBusy(true); setDelErr("");
    try {
      if (del.kind === "status") {
        const target = inUse ? statuses.find((x) => String(x.id) === replacement) : null;
        if (inUse && !target) throw new Error("Please choose a replacement status.");
        await removeStatus(supabase, me, { id: del.id, name: del.name }, target || null);
      } else {
        const target = inUse ? countries.find((x) => String(x.id) === replacement) : null;
        if (inUse && !target) throw new Error("Please choose a replacement country.");
        await removeCountry(supabase, me, { id: del.id, name: del.name }, target || null);
      }
      setListMsg(`"${del.name}" was removed.${inUse ? " Everything that used it was moved to the one you chose." : ""}`);
      setDel(null);
      load();
    } catch (e: any) {
      setDelErr((e?.message || "Something went wrong.") + " Nothing was removed.");
    }
    setDelBusy(false);
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

  const replTarget = del?.kind === "status" ? statuses.find((x) => String(x.id) === replacement) : null;
  const delInUse = !!del && del.leadCount + del.clientCount > 0;

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
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-ink">Staff can see and work on each other's leads</div>
                <div className="text-xs text-slate-500 mt-1">
                  When on, any staff member can open a colleague's lead, add notes, change status and set follow-ups, which helps when someone is busy.
                  Only you can reassign or convert leads, and Clients, payments and documents stay Admin-only.
                  Every action is logged under the person who did it.
                </div>
              </div>
              {sharingAvailable && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={sharing}
                  aria-label="Staff can see each other's leads"
                  onClick={toggleSharing}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${sharing ? "bg-emerald-500" : "bg-slate-300"}`}
                >
                  <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform ${sharing ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              )}
            </div>
            {!sharingAvailable && (
              <div className="text-xs text-amber-700 mt-3">Not set up yet: run <b>supabase/share_leads_between_staff.sql</b> once in your Supabase SQL Editor, then reload this page.</div>
            )}
            {sharingMsg && <div className="text-xs text-slate-600 mt-3">{sharingMsg}</div>}
          </div>

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

          {listMsg && (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{listMsg}</div>
          )}

          <div>
            <div className="text-sm font-semibold mb-1 text-ink">Countries</div>
            <div className="text-xs text-slate-500 mb-3">Removing a country that leads or clients use asks you where to move them first.</div>
            <div className="rounded-lg border border-slate-200 divide-y bg-white mb-3">
              {countries.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span>{c.name}</span>
                  <button
                    type="button"
                    onClick={() => askDelete("country", c)}
                    disabled={countries.length <= 1}
                    aria-label={`Remove ${c.name}`}
                    title={countries.length <= 1 ? "At least one country must remain" : `Remove ${c.name}`}
                    className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2"><input placeholder="Add country" className={inputCls} value={newCountry} onChange={(e) => setNewCountry(e.target.value)} /><Btn onClick={addCountry}>Add</Btn></div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-1 text-ink">Lead statuses</div>
            <div className="text-xs text-slate-500 mb-3">
              Tick <b>No follow-up needed</b> for statuses like Not Interested, Cancelled or Closed. A lead set to one of them has its follow-up date cleared automatically.
            </div>
            {!closesAvailable && (
              <div className="text-xs text-amber-700 mb-3">To use this setting, run <b>supabase/status_rules.sql</b> once in your Supabase SQL Editor, then reload this page.</div>
            )}
            <div className="rounded-lg border border-slate-200 divide-y bg-white mb-3">
              {statuses.map((st) => {
                const isProtected = PROTECTED_STATUSES.includes(st.name);
                return (
                  <div key={st.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${statusDotColor(st.name)}`} />
                      {st.name}
                      {isProtected && <Badge>System</Badge>}
                    </span>
                    <div className="flex items-center gap-3">
                      {closesAvailable && (
                        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                          <input type="checkbox" checked={!!st.closes_lead} onChange={() => toggleCloses(st)} />
                          No follow-up needed
                        </label>
                      )}
                      <button
                        type="button"
                        onClick={() => askDelete("status", st)}
                        disabled={isProtected || statuses.length <= 1}
                        aria-label={`Remove ${st.name}`}
                        title={isProtected ? "The system needs this status, so it can't be removed" : `Remove ${st.name}`}
                        className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input placeholder="Add status" className={inputCls} value={newStatus} onChange={(e) => setNewStatus(e.target.value)} />
              {closesAvailable && (
                <label className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap cursor-pointer">
                  <input type="checkbox" checked={newStatusCloses} onChange={(e) => setNewStatusCloses(e.target.checked)} />
                  No follow-up needed
                </label>
              )}
              <Btn onClick={addStatus}>Add</Btn>
            </div>
          </div>
        </>
      )}

      {del && (
        <Modal title={`Remove ${del.kind === "status" ? "status" : "country"} "${del.name}"`} onClose={() => { if (!delBusy) setDel(null); }}>
          {!delInUse ? (
            <p className="text-sm text-slate-600">Nothing is using <b>{del.name}</b> right now, so it will simply be removed.</p>
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-3">
                {del.leadCount > 0 && <><b>{del.leadCount}</b> {del.leadCount === 1 ? "lead" : "leads"}</>}
                {del.leadCount > 0 && del.clientCount > 0 && " and "}
                {del.clientCount > 0 && <><b>{del.clientCount}</b> {del.clientCount === 1 ? "client" : "clients"}</>}
                {" "}currently use <b>{del.name}</b>. Choose where to move {del.leadCount + del.clientCount === 1 ? "it" : "them"} before it is removed.
              </p>
              <Field label={del.kind === "status" ? "Move these leads to status" : "Move these to country"}>
                <select className={inputCls} value={replacement} onChange={(e) => setReplacement(e.target.value)}>
                  <option value="">Select…</option>
                  {(del.kind === "status" ? statuses : countries).filter((x) => x.id !== del.id).map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
              </Field>
              {replTarget?.closes_lead && (
                <p className="text-xs text-amber-700 mt-2">That status closes leads, so any follow-up dates on the moved leads will be cleared.</p>
              )}
              <p className="text-xs text-slate-400 mt-2">Each moved lead gets a note in its timeline.</p>
            </>
          )}
          {delErr && <div className="text-xs text-red-600 mt-3">{delErr}</div>}
          <div className="flex gap-2 mt-4">
            <Btn variant="danger" onClick={confirmDelete} disabled={delBusy}>{delBusy ? "Working…" : delInUse ? "Move and remove" : "Remove"}</Btn>
            <Btn variant="ghost" onClick={() => setDel(null)} disabled={delBusy}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
