"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Lead, LeadActivity, Profile, fmtDate, followUpLabel, followUpTone, FOLLOWUP_TYPES } from "@/lib/types";
import { Badge, Btn, Field, inputCls, Modal } from "@/components/ui";

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [me, setMe] = useState<Profile | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [staffOptions, setStaffOptions] = useState<Profile[]>([]);
  const [note, setNote] = useState("");
  const [statusVal, setStatusVal] = useState("");
  const [fuDate, setFuDate] = useState("");
  const [fuType, setFuType] = useState("Call");
  const [fuNote, setFuNote] = useState("");
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setMe(profile);
    const { data: leadRow, error } = await supabase.from("leads").select("*").eq("id", id).single();
    if (error || !leadRow) { setLoading(false); return; }
    setLead(leadRow);
    setStatusVal(leadRow.status);
    setFuDate(leadRow.next_followup_date || "");
    const { data: acts } = await supabase.from("lead_activities").select("*").eq("lead_id", id).order("created_at");
    setActivities(acts || []);
    const { data: statusRows } = await supabase.from("lead_statuses").select("name").order("sort_order");
    setStatuses((statusRows || []).map((s) => s.name));
    if (profile?.role === "admin") {
      const { data: staffRows } = await supabase.from("profiles").select("*").eq("role", "staff").eq("active", true);
      setStaffOptions(staffRows || []);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [id]);

  async function logActivity(type: string, detail: string) {
    await supabase.from("lead_activities").insert({ lead_id: id, actor_id: me!.id, actor_name: me!.full_name, activity_type: type, detail });
  }

  async function addNote() {
    if (!note.trim()) return;
    await logActivity("Note added", note.trim());
    setNote(""); load();
  }
  async function changeStatus() {
    if (!lead || statusVal === lead.status) return;
    await supabase.from("leads").update({ status: statusVal }).eq("id", id);
    await logActivity("Status changed", `${lead.status} → ${statusVal}`);
    load();
  }
  async function setFollowUp() {
    if (!fuDate) return;
    await supabase.from("leads").update({ next_followup_date: fuDate, next_followup_type: fuType, next_followup_note: fuNote, next_followup_reminder: true }).eq("id", id);
    await logActivity("Follow-up scheduled", `${fuType} on ${fmtDate(fuDate)}${fuNote ? " — " + fuNote : ""}`);
    setFuNote(""); load();
  }
  async function markCompleted() {
    if (!lead?.next_followup_date) return;
    const t = lead.next_followup_type;
    await supabase.from("leads").update({ next_followup_date: null, next_followup_type: null, next_followup_note: null }).eq("id", id);
    await logActivity("Follow-up completed", `${t} follow-up marked done`);
    load();
  }
  async function reassign(newStaffId: string) {
    if (!lead || newStaffId === lead.assigned_staff_id) return;
    const oldName = staffOptions.find((s) => s.id === lead.assigned_staff_id)?.full_name || "Unassigned";
    const newName = staffOptions.find((s) => s.id === newStaffId)?.full_name || "Unassigned";
    await supabase.from("leads").update({ assigned_staff_id: newStaffId || null }).eq("id", id);
    await logActivity("Staff reassigned", `${oldName} → ${newName}`);
    load();
  }
  async function convert() {
    const { data, error } = await supabase.rpc("convert_lead_to_client", { p_lead_id: id });
    if (error) { alert(error.message); return; }
    router.push(`/clients/${data}`);
  }

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;
  if (!lead) return <div className="text-slate-500 text-sm">Lead not found, or you don't have access to it.</div>;
  const isAdmin = me?.role === "admin";

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4 text-ink">{lead.lead_code} — {lead.name}</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-slate-400">Mobile</div><div>{lead.mobile}</div></div>
            <div><div className="text-xs text-slate-400">Location</div><div>{lead.location || "—"}</div></div>
            <div><div className="text-xs text-slate-400">Source</div><div>{lead.source || "—"}</div></div>
            <div><div className="text-xs text-slate-400">Created</div><div>{fmtDate(lead.created_at.slice(0, 10))}</div></div>
          </div>

          <div className="p-3 rounded-md bg-slate-100">
            <div className="text-xs font-medium mb-1 text-slate-500">Next follow-up</div>
            <div className={`text-sm font-medium ${followUpTone(lead.next_followup_date) === "red" ? "text-red-700" : "text-ink"}`}>{followUpLabel(lead.next_followup_date)}</div>
            {lead.next_followup_note && <div className="text-sm mt-1 text-slate-600">{lead.next_followup_note}</div>}
            {lead.next_followup_date && <div className="mt-2"><Btn variant="subtle" onClick={markCompleted}>Mark completed</Btn></div>}
          </div>

          <Field label="Add call note / feedback">
            <textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Btn variant="subtle" onClick={addNote}>Save note</Btn>

          <Field label="Update status">
            <div className="flex gap-2">
              <select className={inputCls} value={statusVal} onChange={(e) => setStatusVal(e.target.value)}>
                {statuses.map((s) => <option key={s}>{s}</option>)}
              </select>
              <Btn variant="subtle" onClick={changeStatus}>Update</Btn>
            </div>
          </Field>

          <div className="p-3 rounded-md bg-slate-100">
            <div className="text-xs font-medium mb-2 text-slate-500">Schedule next follow-up</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input type="date" className={inputCls} value={fuDate} onChange={(e) => setFuDate(e.target.value)} />
              <select className={inputCls} value={fuType} onChange={(e) => setFuType(e.target.value)}>
                {FOLLOWUP_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <input className={inputCls + " mb-2"} placeholder="Note" value={fuNote} onChange={(e) => setFuNote(e.target.value)} />
            <Btn onClick={setFollowUp}>Save follow-up</Btn>
          </div>

          {isAdmin && (
            <Field label="Reassign staff">
              <select className={inputCls} value={lead.assigned_staff_id || ""} onChange={(e) => reassign(e.target.value)}>
                <option value="">Unassigned</option>
                {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </Field>
          )}

          {isAdmin && !lead.converted && <Btn className="w-full justify-center" onClick={() => setConfirmConvert(true)}>Convert to client</Btn>}
          {lead.converted && <Badge tone="green">Converted to client</Badge>}
        </div>

        <div>
          <div className="text-xs font-medium mb-3 text-slate-500">ACTIVITY TIMELINE</div>
          <div className="max-h-[500px] overflow-y-auto pr-2 space-y-0">
            {[...activities].reverse().map((a) => (
              <div key={a.id} className="pb-4 border-l-2 border-slate-200 pl-3 ml-1">
                <div className="text-sm font-medium text-ink">{a.activity_type}</div>
                {a.detail && <div className="text-sm text-slate-600">{a.detail}</div>}
                <div className="text-xs text-slate-400 mt-0.5">{new Date(a.created_at).toLocaleString("en-IN")} · {a.actor_name}</div>
              </div>
            ))}
            {!activities.length && <div className="text-sm text-slate-400">No activity yet.</div>}
          </div>
        </div>
      </div>

      {confirmConvert && (
        <Modal title="Convert lead to client" onClose={() => setConfirmConvert(false)}>
          <p className="text-sm text-slate-600 mb-4">This creates a client record for <b>{lead.name}</b> and preserves the full lead history. The client record will only be visible to Admin.</p>
          <div className="flex gap-2">
            <Btn onClick={convert}>Confirm conversion</Btn>
            <Btn variant="ghost" onClick={() => setConfirmConvert(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
