"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Lead, LeadActivity, Profile, fmtDate, toLocalDateStr, followUpLabel, followUpTone, FOLLOWUP_TYPES } from "@/lib/types";
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
  const [lastNoteText, setLastNoteText] = useState("");
  const [statusVal, setStatusVal] = useState("");
  const [fuDate, setFuDate] = useState("");
  const [fuType, setFuType] = useState("Call");
  const [fuNote, setFuNote] = useState("");
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingDetails, setEditingDetails] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [locationVal, setLocationVal] = useState("");
  const [countryVal, setCountryVal] = useState<number | "">("");
  const [countries, setCountries] = useState<{ id: number; name: string }[]>([]);

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
    setNameVal(leadRow.name || "");
    setLocationVal(leadRow.location || "");
    setCountryVal(leadRow.country_id || "");
    const { data: countryRows } = await supabase.from("countries").select("*").order("name");
    setCountries(countryRows || []);
    const { data: acts } = await supabase.from("lead_activities").select("*").eq("lead_id", id).order("created_at");
    setActivities(acts || []);
    const noteActs = (acts || []).filter((a) => a.activity_type === "Note added" && a.detail?.trim());
    const latestNote = noteActs.length ? noteActs[noteActs.length - 1].detail.trim() : "";
    setNote(latestNote);
    setLastNoteText(latestNote);
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

  const CLOSING_STATUSES = ["Not Interested"];
  async function saveUpdate() {
    if (!lead) return;
    const changes: string[] = [];
    const patch: any = {};

    const trimmedNote = note.trim();
    const noteChanged = trimmedNote.length > 0 && trimmedNote !== lastNoteText.trim();
    if (noteChanged) changes.push(`Note: ${trimmedNote}`);

    const statusChanged = statusVal !== lead.status;
    const willClose = CLOSING_STATUSES.includes(statusVal);
    if (statusChanged) {
      patch.status = statusVal;
      changes.push(`Status: ${lead.status} → ${statusVal}`);
      if (willClose) {
        patch.next_followup_date = null;
        patch.next_followup_type = null;
        patch.next_followup_note = null;
        patch.next_followup_reminder = false;
        if (lead.next_followup_date) changes.push("Follow-up closed — no longer needed");
      }
    }

    const fuNoteTrimmed = fuNote.trim();
    const fuChanged = !willClose && !!fuDate && (fuDate !== lead.next_followup_date || fuType !== lead.next_followup_type || fuNoteTrimmed !== (lead.next_followup_note || ""));
    if (fuChanged) {
      patch.next_followup_date = fuDate;
      patch.next_followup_type = fuType;
      patch.next_followup_note = fuNoteTrimmed || null;
      patch.next_followup_reminder = true;
      changes.push(`Follow-up: ${fuType} on ${fmtDate(fuDate)}${fuNoteTrimmed ? " — " + fuNoteTrimmed : ""}`);
    }

    if (!changes.length) return;
    if (Object.keys(patch).length) {
      await supabase.from("leads").update(patch).eq("id", id);
    }
    await logActivity("Lead updated", changes.join(" · "));
    setFuNote("");
    load();
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
  async function saveDetails() {
    if (!lead) return;
    const oldName = lead.name?.trim() || "(no name)";
    const oldLocation = lead.location?.trim() || "(no location)";
    const oldCountryName = countries.find((c) => c.id === lead.country_id)?.name || "(none)";
    const newName = nameVal.trim();
    const newLocation = locationVal.trim();
    const newCountryName = countries.find((c) => c.id === countryVal)?.name || "(none)";
    const nameChanged = newName !== (lead.name || "");
    const locationChanged = newLocation !== (lead.location || "");
    const countryChanged = countryVal !== lead.country_id;
    if (!nameChanged && !locationChanged && !countryChanged) { setEditingDetails(false); return; }
    await supabase.from("leads").update({ name: newName, location: newLocation || null, country_id: countryVal || null }).eq("id", id);
    const changes: string[] = [];
    if (nameChanged) changes.push(`Name: ${oldName} → ${newName || "(no name)"}`);
    if (locationChanged) changes.push(`Location: ${oldLocation} → ${newLocation || "(no location)"}`);
    if (countryChanged) changes.push(`Country: ${oldCountryName} → ${newCountryName}`);
    await logActivity("Details updated", changes.join(" · "));
    setEditingDetails(false);
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
      <h2 className="text-lg font-semibold mb-4 text-ink">
        {lead.lead_code} — {lead.name?.trim() ? lead.name : <span className="text-amber-600 italic">Name pending</span>}
      </h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          {!editingDetails ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-slate-400">Mobile</div><div>{lead.mobile}</div></div>
              <div><div className="text-xs text-slate-400">Location</div><div>{lead.location || "—"}</div></div>
              <div><div className="text-xs text-slate-400">Country</div><div>{countries.find((c) => c.id === lead.country_id)?.name || "—"}</div></div>
              <div><div className="text-xs text-slate-400">Source</div><div>{lead.source || "—"}</div></div>
              <div><div className="text-xs text-slate-400">Created</div><div>{fmtDate(toLocalDateStr(lead.created_at))}</div></div>
              <div className="col-span-2">
                <Btn variant="ghost" onClick={() => setEditingDetails(true)}>Edit name / location / country</Btn>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-md bg-slate-100 space-y-2">
              <Field label="Name">
                <input className={inputCls} value={nameVal} onChange={(e) => setNameVal(e.target.value)} placeholder="e.g. Rohan Sharma" autoFocus />
              </Field>
              <Field label="Location">
                <input className={inputCls} value={locationVal} onChange={(e) => setLocationVal(e.target.value)} placeholder="e.g. Hyderabad" />
              </Field>
              <Field label="Country">
                <select className={inputCls} value={countryVal} onChange={(e) => setCountryVal(Number(e.target.value))}>
                  {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <div className="flex gap-2 pt-1">
                <Btn onClick={saveDetails}>Save</Btn>
                <Btn variant="ghost" onClick={() => { setNameVal(lead.name || ""); setLocationVal(lead.location || ""); setCountryVal(lead.country_id || ""); setEditingDetails(false); }}>Cancel</Btn>
              </div>
            </div>
          )}

          <div className="p-3 rounded-md bg-slate-100">
            <div className="text-xs font-medium mb-1 text-slate-500">Next follow-up</div>
            {CLOSING_STATUSES.includes(lead.status) ? (
              <div className="text-sm font-medium text-slate-500">Lead closed ({lead.status}) — no follow-up needed</div>
            ) : (
              <>
                <div className={`text-sm font-medium ${followUpTone(lead.next_followup_date) === "red" ? "text-red-700" : "text-ink"}`}>{followUpLabel(lead.next_followup_date)}</div>
                {lead.next_followup_note && <div className="text-sm mt-1 text-slate-600">{lead.next_followup_note}</div>}
                {lead.next_followup_date && <div className="mt-2"><Btn variant="subtle" onClick={markCompleted}>Mark completed</Btn></div>}
              </>
            )}
          </div>

          <div className="p-4 rounded-md border-2 border-navy3/20 bg-white space-y-3">
            <div className="text-sm font-semibold text-ink">Update this lead</div>

            <Field label={lastNoteText ? "Call note (last note shown below — edit it, or leave as is)" : "Call note"}>
              <textarea className={inputCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did the client say?" />
            </Field>

            <Field label="Status">
              <select className={inputCls} value={statusVal} onChange={(e) => setStatusVal(e.target.value)}>
                {statuses.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>

            {!CLOSING_STATUSES.includes(statusVal) && (
              <div>
                <div className="text-xs font-medium mb-2 text-slate-500">Next follow-up (shown below if one's already set — change it to reschedule, or leave as is)</div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input type="date" className={inputCls} value={fuDate} onChange={(e) => setFuDate(e.target.value)} />
                  <select className={inputCls} value={fuType} onChange={(e) => setFuType(e.target.value)}>
                    {FOLLOWUP_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <input className={inputCls} placeholder="Follow-up note (optional)" value={fuNote} onChange={(e) => setFuNote(e.target.value)} />
              </div>
            )}

            <Btn className="w-full justify-center" onClick={saveUpdate}>Save update</Btn>
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
          <p className="text-sm text-slate-600 mb-4">This creates a client record for <b>{lead.name?.trim() || lead.mobile}</b> and preserves the full lead history. The client record will only be visible to Admin.</p>
          {!lead.name?.trim() && <p className="text-xs text-amber-600 mb-4">This lead doesn't have a name yet — consider adding it first so the client record isn't blank.</p>}
          <div className="flex gap-2">
            <Btn onClick={convert}>Confirm conversion</Btn>
            <Btn variant="ghost" onClick={() => setConfirmConvert(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
