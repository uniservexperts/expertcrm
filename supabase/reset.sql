-- Run this once before re-running the corrected schema.sql, to remove
-- any objects created by the earlier failed run.
drop function if exists public.set_visa_status(uuid, text);
drop function if exists public.convert_lead_to_client(uuid);
drop function if exists public.find_duplicate_mobile(text);
drop table if exists refunds cascade;
drop table if exists visa_status_history cascade;
drop table if exists slots cascade;
drop table if exists payments cascade;
drop table if exists client_documents cascade;
drop table if exists clients cascade;
drop table if exists lead_activities cascade;
drop table if exists leads cascade;
drop sequence if exists lead_number_seq;
drop sequence if exists client_number_seq;
drop table if exists lead_statuses cascade;
drop table if exists countries cascade;
drop function if exists public.current_role();
drop function if exists public.app_role();
drop function if exists public.is_admin();
drop table if exists profiles cascade;
