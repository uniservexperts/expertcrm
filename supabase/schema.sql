-- ============================================================
-- Meridian Immigration CRM — Database schema + security rules
-- Run this entire file once in Supabase: Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. PROFILES
-- One row per login (admin or staff). id = the Supabase Auth user id.
-- ------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Helper functions used inside policies below (security definer so they can
-- read `profiles` regardless of the caller's own row-level permissions).
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;

alter table profiles enable row level security;

create policy "profiles: user reads own row" on profiles
  for select using (id = auth.uid());
create policy "profiles: admin reads all" on profiles
  for select using (is_admin());
create policy "profiles: admin updates all" on profiles
  for update using (is_admin());
-- No client-side INSERT policy: staff accounts are created only via the
-- server-side /api/admin/create-staff route using the service role key.

-- ------------------------------------------------------------
-- 2. LOOKUP TABLES — countries & lead statuses (admin-editable)
-- ------------------------------------------------------------
create table countries (
  id serial primary key,
  name text unique not null
);
insert into countries (name) values ('Netherlands'),('France'),('Poland'),('Denmark'),('Others');

create table lead_statuses (
  id serial primary key,
  name text unique not null,
  sort_order int not null default 0
);
insert into lead_statuses (name, sort_order) values
 ('New Lead',1),('Contacted',2),('Interested',3),('Call Later',4),
 ('Will Visit Office',5),('Price Negotiation',6),('Waiting for Decision',7),
 ('Documents Discussion',8),('Confirmed Client',9),('Not Interested',10),
 ('No Response',11),('Cancelled',12);

alter table countries enable row level security;
alter table lead_statuses enable row level security;
create policy "lookups: any logged-in user reads" on countries for select using (auth.uid() is not null);
create policy "lookups: admin writes" on countries for all using (is_admin()) with check (is_admin());
create policy "lookups: any logged-in user reads statuses" on lead_statuses for select using (auth.uid() is not null);
create policy "lookups: admin writes statuses" on lead_statuses for all using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
-- 3. LEADS  (the core table)
-- ------------------------------------------------------------
create sequence lead_number_seq start 1;

create table leads (
  id uuid primary key default gen_random_uuid(),
  lead_code text not null default ('L-' || lpad(nextval('lead_number_seq')::text, 4, '0')),
  name text not null,
  mobile text not null,
  location text,
  source text,
  country_id int references countries(id),
  assigned_staff_id uuid references profiles(id),
  status text not null default 'New Lead',
  created_at timestamptz not null default now(),
  next_followup_date date,
  next_followup_type text,
  next_followup_reminder boolean default true,
  next_followup_note text,
  converted boolean not null default false,
  client_id uuid,
  created_by uuid references profiles(id)
);
create index leads_assigned_idx on leads(assigned_staff_id);
create index leads_mobile_idx on leads(mobile);

alter table leads enable row level security;

-- SELECT: admin sees everything; staff sees only rows assigned to them.
create policy "leads: admin select all" on leads for select using (is_admin());
create policy "leads: staff select own" on leads for select using (assigned_staff_id = auth.uid());

-- INSERT: any authenticated staff/admin can create a lead. Staff may only
-- create leads assigned to themselves (or admin can assign to anyone).
create policy "leads: admin insert" on leads for insert with check (is_admin());
create policy "leads: staff insert own" on leads for insert with check (
  app_role() = 'staff' and (assigned_staff_id = auth.uid() or assigned_staff_id is null)
);

-- UPDATE: admin can update any lead (status, follow-up, reassignment, conversion).
-- Staff can update ONLY leads assigned to them, and cannot reassign to someone else.
create policy "leads: admin update all" on leads for update using (is_admin()) with check (is_admin());
create policy "leads: staff update own" on leads for update
  using (assigned_staff_id = auth.uid())
  with check (assigned_staff_id = auth.uid());

-- DELETE: admin only.
create policy "leads: admin delete" on leads for delete using (is_admin());

-- ------------------------------------------------------------
-- 4. LEAD ACTIVITIES — the audit / timeline log
-- ------------------------------------------------------------
create table lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  actor_id uuid references profiles(id),
  actor_name text not null,
  activity_type text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index lead_activities_lead_idx on lead_activities(lead_id);

alter table lead_activities enable row level security;

create policy "activities: admin all" on lead_activities for all using (is_admin()) with check (is_admin());
create policy "activities: staff select own leads" on lead_activities for select using (
  exists (select 1 from leads l where l.id = lead_activities.lead_id and l.assigned_staff_id = auth.uid())
);
create policy "activities: staff insert own leads" on lead_activities for insert with check (
  exists (select 1 from leads l where l.id = lead_activities.lead_id and l.assigned_staff_id = auth.uid())
);

-- ------------------------------------------------------------
-- 5. CLIENTS — admin only, end to end. No staff policy exists on any
--    of the tables in this section, so RLS denies staff by default.
-- ------------------------------------------------------------
create sequence client_number_seq start 1;

create table clients (
  id uuid primary key default gen_random_uuid(),
  client_code text not null default ('C-' || lpad(nextval('client_number_seq')::text, 4, '0')),
  lead_id uuid references leads(id),
  name text not null,
  mobile text not null,
  location text,
  country_id int references countries(id),
  assigned_staff_id uuid references profiles(id), -- reference/informational only
  conversion_date date not null default current_date,
  converted_by uuid references profiles(id),
  total_fee numeric not null default 0,
  visa_status text not null default 'Pending with VFS' check (visa_status in ('Pending with VFS','Approved','Refused')),
  notes text,
  created_at timestamptz not null default now()
);

alter table leads add constraint leads_client_fk foreign key (client_id) references clients(id);

create table client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  doc_key text not null check (doc_key in ('passportFront','passportBack','aadhaar','pan','bankStatement')),
  received boolean not null default false,
  received_date date,
  note text,
  unique(client_id, doc_key)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  amount numeric not null check (amount > 0),
  payment_date date not null default current_date,
  remarks text,
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table slots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references clients(id) on delete cascade,
  slot_date date,
  slot_time time,
  location text,
  info_sent boolean not null default false,
  info_sent_date date,
  remarks text
);

create table visa_status_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references clients(id) on delete cascade,
  applicable boolean not null default false,
  amount numeric not null default 10000,
  status text not null default 'Not applicable',
  refund_date date,
  remarks text
);

alter table clients enable row level security;
alter table client_documents enable row level security;
alter table payments enable row level security;
alter table slots enable row level security;
alter table visa_status_history enable row level security;
alter table refunds enable row level security;

create policy "clients: admin only" on clients for all using (is_admin()) with check (is_admin());
create policy "client_documents: admin only" on client_documents for all using (is_admin()) with check (is_admin());
create policy "payments: admin only" on payments for all using (is_admin()) with check (is_admin());
create policy "slots: admin only" on slots for all using (is_admin()) with check (is_admin());
create policy "visa_status_history: admin only" on visa_status_history for all using (is_admin()) with check (is_admin());
create policy "refunds: admin only" on refunds for all using (is_admin()) with check (is_admin());
-- (No policy for role = 'staff' on any of the six tables above → Postgres
-- RLS default-denies staff, at the database level, for every operation.)

-- ------------------------------------------------------------
-- 6. Duplicate-mobile check, callable by staff without exposing full
--    lead/client records they aren't otherwise allowed to see.
--    Returns only the minimum needed to prevent a duplicate: which
--    record type it is, its code, and who owns it.
-- ------------------------------------------------------------
create or replace function public.find_duplicate_mobile(p_mobile text)
returns table(kind text, code text, name text, owner_name text)
language sql security definer set search_path = public as $$
  select 'lead', l.lead_code, l.name, coalesce(p.full_name, 'Unassigned')
  from leads l left join profiles p on p.id = l.assigned_staff_id
  where regexp_replace(l.mobile, '\D', '', 'g') = regexp_replace(p_mobile, '\D', '', 'g')
  union all
  select 'client', c.client_code, c.name, coalesce(p.full_name, '—')
  from clients c left join profiles p on p.id = c.assigned_staff_id
  where regexp_replace(c.mobile, '\D', '', 'g') = regexp_replace(p_mobile, '\D', '', 'g')
  limit 1;
$$;
grant execute on function public.find_duplicate_mobile(text) to authenticated;

-- ------------------------------------------------------------
-- 7. Lead → Client conversion, done as one atomic, admin-only transaction
--    so history is never lost and both tables stay in sync.
-- ------------------------------------------------------------
create or replace function public.convert_lead_to_client(p_lead_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lead leads%rowtype;
  v_client_id uuid;
begin
  if not is_admin() then
    raise exception 'Only Admin can convert leads to clients';
  end if;

  select * into v_lead from leads where id = p_lead_id;
  if v_lead.id is null then
    raise exception 'Lead not found';
  end if;
  if v_lead.converted then
    raise exception 'Lead already converted';
  end if;

  insert into clients (lead_id, name, mobile, location, country_id, assigned_staff_id, converted_by)
  values (v_lead.id, v_lead.name, v_lead.mobile, v_lead.location, v_lead.country_id, v_lead.assigned_staff_id, auth.uid())
  returning id into v_client_id;

  insert into client_documents (client_id, doc_key)
  values (v_client_id,'passportFront'),(v_client_id,'passportBack'),(v_client_id,'aadhaar'),(v_client_id,'pan'),(v_client_id,'bankStatement');

  insert into slots (client_id) values (v_client_id);
  insert into refunds (client_id) values (v_client_id);

  update leads set converted = true, client_id = v_client_id, status = 'Confirmed Client' where id = p_lead_id;

  insert into lead_activities (lead_id, actor_id, actor_name, activity_type, detail)
  values (p_lead_id, auth.uid(), (select full_name from profiles where id = auth.uid()), 'Converted to client', 'Client record ' || (select client_code from clients where id = v_client_id) || ' created');

  return v_client_id;
end;
$$;
grant execute on function public.convert_lead_to_client(uuid) to authenticated;

-- ------------------------------------------------------------
-- 8. Visa status change → auto-log history + auto-flag ₹10,000 refund
-- ------------------------------------------------------------
create or replace function public.set_visa_status(p_client_id uuid, p_new_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_prev text;
begin
  if not is_admin() then
    raise exception 'Only Admin can change visa status';
  end if;
  select visa_status into v_prev from clients where id = p_client_id;
  update clients set visa_status = p_new_status where id = p_client_id;
  insert into visa_status_history (client_id, previous_status, new_status, changed_by)
  values (p_client_id, v_prev, p_new_status, auth.uid());
  if p_new_status = 'Refused' then
    update refunds set applicable = true, status = case when status = 'Not applicable' then 'Pending' else status end
    where client_id = p_client_id;
  end if;
end;
$$;
grant execute on function public.set_visa_status(uuid, text) to authenticated;

-- ============================================================
-- End of schema. Next: create your Admin login (see README section E).
-- ============================================================
