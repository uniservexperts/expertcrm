-- Adds a "last updated" timestamp to every lead so the Leads list can show
-- recently-touched leads at the top. Safe to run once; safe to re-run.

alter table leads add column if not exists last_activity_at timestamptz default now();

-- Backfill existing leads from their most recent activity (or creation date).
update leads l
set last_activity_at = coalesce(
  (select max(a.created_at) from lead_activities a where a.lead_id = l.id),
  l.created_at
);

-- Keep it up to date automatically: any new activity (note, status change,
-- follow-up, reassignment, etc.) bumps the lead's last_activity_at.
create or replace function public.touch_lead_last_activity()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update leads set last_activity_at = new.created_at where id = new.lead_id;
  return new;
end;
$$;

drop trigger if exists lead_activity_touch on lead_activities;
create trigger lead_activity_touch
after insert on lead_activities
for each row execute function public.touch_lead_last_activity();

create index if not exists leads_last_activity_idx on leads(last_activity_at desc);
