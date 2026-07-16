-- Smoke test untuk migration init — jalankan di scratch DB Postgres 16:
--   createdb saasify_mig_test
--   psql -d saasify_mig_test -c "create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql as 'select null::uuid'; create role anon nologin; create role authenticated nologin;"
--   psql -d saasify_mig_test -v ON_ERROR_STOP=1 -f supabase/migrations/20260716000000_init.sql
--   psql -d saasify_mig_test -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql

-- 1. Signup trigger auto-creates tenant + owner user
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'rina.salon@gmail.com', '{"name":"Rina"}');
do $$
declare t record;
begin
  select t2.*, u.role into t from tenants t2 join users u on u.tenant_id = t2.id;
  assert t.subdomain = 'rina-salon-111111', 'subdomain: ' || t.subdomain;
  assert t.role = 'owner';
  raise notice 'PASS: signup trigger';
end $$;

-- 2. Double-booking exclusion constraint
insert into services (id, tenant_id, name, duration_min) select '22222222-2222-2222-2222-222222222222', id, 'Facial', 60 from tenants;
insert into staff (id, tenant_id, name) select '33333333-3333-3333-3333-333333333333', id, 'Rina' from tenants;
insert into customers (id, tenant_id, name, email) select '44444444-4444-4444-4444-444444444444', id, 'Maya', 'maya@x.id' from tenants;
insert into bookings (tenant_id, customer_id, service_id, staff_id, start_time, end_time, status)
  select id, '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
  '2026-08-01 10:00+07', '2026-08-01 11:00+07', 'confirmed' from tenants;
do $$
begin
  insert into bookings (tenant_id, customer_id, service_id, staff_id, start_time, end_time, status)
    select id, '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
    '2026-08-01 10:30+07', '2026-08-01 11:30+07', 'pending' from tenants;
  raise exception 'FAIL: overlap was allowed';
exception when exclusion_violation then
  raise notice 'PASS: double-booking blocked by DB';
end $$;

-- 3. Cancelled booking frees the slot
insert into bookings (tenant_id, customer_id, service_id, staff_id, start_time, end_time, status)
  select id, '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
  '2026-08-01 12:00+07', '2026-08-01 13:00+07', 'cancelled' from tenants;
insert into bookings (tenant_id, customer_id, service_id, staff_id, start_time, end_time, status)
  select id, '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
  '2026-08-01 12:00+07', '2026-08-01 13:00+07', 'confirmed' from tenants;
select 'PASS: cancelled slot reusable';
