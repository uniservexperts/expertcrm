import { fetchAllRows } from "@/lib/fetchAll";

// Safe removal of a lead status / country that leads (or clients) may still use.
// Order matters: move everything first, leave a trail in each lead's timeline,
// and only then delete. If any step fails, an error is thrown and the status or
// country is NOT deleted.

export type Actor = { id: string; name: string };

const CLEAR_FOLLOWUP = {
  next_followup_date: null,
  next_followup_type: null,
  next_followup_note: null,
  next_followup_reminder: false,
};

async function logForLeads(supabase: any, leadIds: string[], actor: Actor, activityType: string, detail: string) {
  const rows = leadIds.map((lead_id) => ({
    lead_id, actor_id: actor.id, actor_name: actor.name, activity_type: activityType, detail,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("lead_activities").insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
}

// `target` = the status to move leads to (null when no lead uses the status)
export async function removeStatus(
  supabase: any,
  actor: Actor,
  status: { id: number; name: string },
  target: { name: string; closes_lead?: boolean } | null
) {
  if (target) {
    const patch: any = { status: target.name };
    // moving into a "no follow-up needed" status clears follow-up dates too
    if (target.closes_lead) Object.assign(patch, CLEAR_FOLLOWUP);
    const affected = await fetchAllRows<{ id: string }>((a, b) =>
      supabase.from("leads").select("id").eq("status", status.name).order("id").range(a, b));
    const { error } = await supabase.from("leads").update(patch).eq("status", status.name);
    if (error) throw error;
    await logForLeads(supabase, affected.map((l) => l.id), actor, "Status changed",
      `${status.name} → ${target.name} (status "${status.name}" was removed by Admin)`);
  }
  const { error: delErr } = await supabase.from("lead_statuses").delete().eq("id", status.id);
  if (delErr) throw delErr;
}

// `target` = the country to move leads and clients to (null when nothing uses it)
export async function removeCountry(
  supabase: any,
  actor: Actor,
  country: { id: number; name: string },
  target: { id: number; name: string } | null
) {
  if (target) {
    const affected = await fetchAllRows<{ id: string }>((a, b) =>
      supabase.from("leads").select("id").eq("country_id", country.id).order("id").range(a, b));
    const { error: leadErr } = await supabase.from("leads").update({ country_id: target.id }).eq("country_id", country.id);
    if (leadErr) throw leadErr;
    const { error: clientErr } = await supabase.from("clients").update({ country_id: target.id }).eq("country_id", country.id);
    if (clientErr) throw clientErr;
    await logForLeads(supabase, affected.map((l) => l.id), actor, "Details updated",
      `Country: ${country.name} → ${target.name} (country "${country.name}" was removed by Admin)`);
  }
  const { error: delErr } = await supabase.from("countries").delete().eq("id", country.id);
  if (delErr) throw delErr;
}
