-- ============================================================
-- "No follow-up needed" setting for lead statuses
-- Run once in Supabase -> SQL Editor. Safe to re-run.
--
--  * Adds a per-status flag (Settings -> Lead statuses -> "No follow-up needed").
--  * Starts it ON for: Not Interested, Cancelled, and any status whose name
--    contains "closed" or "complet" (e.g. "Closed Completed").
--  * When a lead is set to such a status, its follow-up date is cleared
--    automatically (also enforced here in the database, not just on screen).
--  * Cleans up leads that are ALREADY in such a status but still carry a
--    follow-up date.
-- ============================================================

alter table lead_statuses add column if not exists closes_lead boolean not null default false;

update lead_statuses
set closes_lead = true
where name in ('Not Interested', 'Cancelled')
   or name ilike '%closed%'
   or name ilike '%complet%';

-- Database-level guarantee: a lead in a closing status never has a follow-up
create or replace function public.clear_followup_when_closed()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from lead_statuses where name = new.status and closes_lead) then
    new.next_followup_date := null;
    new.next_followup_type := null;
    new.next_followup_note := null;
    new.next_followup_reminder := false;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_clear_followup_when_closed on leads;
create trigger leads_clear_followup_when_closed
before insert or update of status, next_followup_date on leads
for each row execute function public.clear_followup_when_closed();

-- One-time cleanup of existing leads (this fires the trigger above)
update leads
set status = status
where next_followup_date is not null
  and status in (select name from lead_statuses where closes_lead);
