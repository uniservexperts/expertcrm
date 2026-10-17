-- ============================================================
-- Let staff see and work on each other's leads (Admin-controlled)
-- Run once in Supabase -> SQL Editor. Safe to re-run.
--
-- What this does:
--   * Adds an on/off switch (Settings page, Admin only). Default: ON.
--   * While ON, any ACTIVE staff member can view and update ANY lead
--     (notes, status, follow-ups) and see teammates' names.
--   * Staff still CANNOT reassign leads or convert them to clients
--     (enforced by a database trigger), and still cannot touch Clients,
--     payments, documents, visa/refund data, reports of others, or settings.
--   * Everything a colleague does is logged under THEIR name in the timeline.
--   * Turn the switch OFF and staff go back to seeing only their own leads.
-- ============================================================

-- 1. Settings table holding the switch
create table if not exists app_settings (
  key text primary key,
  value text not null
);
insert into app_settings (key, value) values ('staff_share_leads', 'true')
on conflict (key) do nothing;

alter table app_settings enable row level security;
drop policy if exists "settings: any logged-in user reads" on app_settings;
create policy "settings: any logged-in user reads" on app_settings
  for select using (auth.uid() is not null);
drop policy if exists "settings: admin writes" on app_settings;
create policy "settings: admin writes" on app_settings
  for all using (is_admin()) with check (is_admin());

-- 2. True only for an ACTIVE staff member while sharing is switched on
create or replace function public.staff_share_enabled()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true' from app_settings where key = 'staff_share_leads'), false)
     and exists (select 1 from profiles where id = auth.uid() and role = 'staff' and active);
$$;

-- 3. Extra policies, added alongside the existing "own leads" ones
--    (Postgres combines permissive policies with OR)
drop policy if exists "leads: staff select shared" on leads;
create policy "leads: staff select shared" on leads
  for select using (staff_share_enabled());

drop policy if exists "leads: staff update shared" on leads;
create policy "leads: staff update shared" on leads
  for update using (staff_share_enabled()) with check (staff_share_enabled());

drop policy if exists "activities: staff select shared" on lead_activities;
create policy "activities: staff select shared" on lead_activities
  for select using (staff_share_enabled());

-- staff may only log activity under their own name
drop policy if exists "activities: staff insert shared" on lead_activities;
create policy "activities: staff insert shared" on lead_activities
  for insert with check (staff_share_enabled() and actor_id = auth.uid());

-- staff can see teammates' names (needed to show "Assigned to ...")
drop policy if exists "profiles: staff see teammates when sharing" on profiles;
create policy "profiles: staff see teammates when sharing" on profiles
  for select using (staff_share_enabled() and role = 'staff');

-- 4. Admin-only fields stay admin-only, even though staff can now update leads
create or replace function public.protect_lead_admin_fields()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the SQL Editor / service role, so those are not blocked
  if auth.uid() is not null and not is_admin() then
    if new.assigned_staff_id is distinct from old.assigned_staff_id then
      raise exception 'Only Admin can reassign leads';
    end if;
    if new.converted is distinct from old.converted
       or new.client_id is distinct from old.client_id then
      raise exception 'Only Admin can convert leads';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_protect_admin_fields on leads;
create trigger leads_protect_admin_fields
before update on leads
for each row execute function public.protect_lead_admin_fields();
