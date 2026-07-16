-- SaaS-ify Booking System — Phase 0: schema + RLS (PRD Section 15)
create extension if not exists btree_gist;

-- ── Enums ────────────────────────────────────────────────────────────
create type plan_t           as enum ('free','starter','pro','business');
create type tenant_status_t  as enum ('active','suspended','cancelled');
create type user_role_t      as enum ('owner','admin','staff');
create type payment_mode_t   as enum ('free','full','deposit','at_venue');
create type booking_status_t as enum ('pending','confirmed','cancelled','no_show','completed','payment_failed');
create type payment_status_t as enum ('pending','completed','failed','refunded');
create type cancelled_by_t   as enum ('customer','admin','system');
create type notif_channel_t  as enum ('email','whatsapp');
create type notif_status_t   as enum ('sent','failed','pending');

-- ── Tables ───────────────────────────────────────────────────────────
create table tenants (
  id            uuid primary key default gen_random_uuid(),
  name          varchar(255) not null,
  slug          varchar(100) not null unique,
  subdomain     varchar(63) not null unique,
  custom_domain varchar(255) unique,
  logo_url      text,
  primary_color varchar(7) not null default '#4ade80',
  plan          plan_t not null default 'free',
  status        tenant_status_t not null default 'active',
  timezone      varchar(50) not null default 'Asia/Jakarta',
  stripe_account_id varchar(255),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auth credentials live in auth.users (Supabase Auth); this is the profile.
create table users (
  id         uuid primary key references auth.users(id) on delete cascade,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  email      varchar(255) not null unique,
  name       varchar(255) not null,
  role       user_role_t not null default 'owner',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table services (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          varchar(255) not null,
  description   text,
  duration_min  int not null check (duration_min > 0),
  price         int not null default 0 check (price >= 0),
  buffer_before int not null default 0,
  buffer_after  int not null default 0,
  min_lead_time int not null default 0,
  max_horizon   int not null default 30,
  payment_mode  payment_mode_t not null default 'free',
  deposit_pct   int check (deposit_pct between 1 and 100),
  category      varchar(100),
  image_url     text,
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index services_tenant_idx on services (tenant_id);

create table staff (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid references users(id) on delete set null,
  name       varchar(255) not null,
  bio        text,
  avatar_url text,
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index staff_tenant_idx on staff (tenant_id);

create table staff_services (
  staff_id   uuid not null references staff(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (staff_id, service_id)
);

create table staff_schedules (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time  time not null,
  end_time    time not null check (end_time > start_time),
  break_start time,
  break_end   time,
  is_active   boolean not null default true
);
create index staff_schedules_staff_idx on staff_schedules (staff_id);

create table staff_time_off (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff(id) on delete cascade,
  date       date not null,
  start_time time,          -- null = full day off
  end_time   time,
  reason     text
);
create index staff_time_off_staff_date_idx on staff_time_off (staff_id, date);

create table tenant_holidays (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  date      date not null,
  name      varchar(255) not null,
  unique (tenant_id, date)
);

create table customers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       varchar(255) not null,
  email      varchar(255) not null,
  phone      varchar(30),
  notes      text,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table bookings (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  customer_id    uuid not null references customers(id),
  service_id     uuid not null references services(id),
  staff_id       uuid not null references staff(id),
  start_time     timestamptz not null,
  end_time       timestamptz not null check (end_time > start_time),
  status         booking_status_t not null default 'pending',
  payment_mode   payment_mode_t not null default 'free',
  total_price    int not null default 0,
  deposit_amount int not null default 0,
  internal_notes text,
  customer_notes text,
  cancellation_reason text,
  cancelled_by   cancelled_by_t,
  cancelled_at   timestamptz,
  idempotency_key varchar(255) unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- DB-level double-booking guard: no overlapping pending/confirmed
  -- bookings for the same staff, regardless of app-layer bugs.
  constraint no_double_booking exclude using gist (
    staff_id with =,
    tstzrange(start_time, end_time) with &&
  ) where (status in ('pending','confirmed'))
);
create index bookings_tenant_start_idx on bookings (tenant_id, start_time);
create index bookings_staff_start_idx on bookings (staff_id, start_time);

create table payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings(id),
  tenant_id     uuid not null references tenants(id),
  stripe_session_id varchar(255),
  stripe_payment_intent_id varchar(255),
  amount        int not null,
  currency      varchar(3) not null default 'idr',
  status        payment_status_t not null default 'pending',
  refunded_at   timestamptz,
  refund_amount int,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);
create index payments_tenant_idx on payments (tenant_id);
create index payments_booking_idx on payments (booking_id);

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  booking_id    uuid references bookings(id) on delete set null,
  channel       notif_channel_t not null,
  recipient     varchar(255) not null,
  event_type    varchar(100) not null,
  status        notif_status_t not null default 'pending',
  error_message text,
  sent_at       timestamptz
);
create index notifications_tenant_idx on notifications (tenant_id);

-- ── updated_at triggers ───────────────────────────────────────────────
create extension if not exists moddatetime;
create trigger tenants_updated_at  before update on tenants  for each row execute function moddatetime(updated_at);
create trigger bookings_updated_at before update on bookings for each row execute function moddatetime(updated_at);

-- ── Tenant helpers (used by RLS) ─────────────────────────────────────
-- security definer so RLS on `users` doesn't recurse.
create function public.current_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from users where id = auth.uid()
$$;

create function public.current_user_role() returns user_role_t
language sql stable security definer set search_path = public as $$
  select role from users where id = auth.uid()
$$;

-- ── Auto-provision tenant on signup ──────────────────────────────────
-- Every new auth user gets their own tenant (role: owner). The onboarding
-- wizard later renames/re-slugs it.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base_slug text := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]+', '-', 'g'));
  final_slug text := base_slug || '-' || substr(new.id::text, 1, 6);
  new_tenant_id uuid;
begin
  insert into tenants (name, slug, subdomain)
  values (split_part(new.email, '@', 1), final_slug, final_slug)
  returning id into new_tenant_id;

  insert into users (id, tenant_id, email, name, role)
  values (new.id, new_tenant_id, new.email,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Row-Level Security ────────────────────────────────────────────────
alter table tenants          enable row level security;
alter table users            enable row level security;
alter table services         enable row level security;
alter table staff            enable row level security;
alter table staff_services   enable row level security;
alter table staff_schedules  enable row level security;
alter table staff_time_off   enable row level security;
alter table tenant_holidays  enable row level security;
alter table customers        enable row level security;
alter table bookings         enable row level security;
alter table payments         enable row level security;
alter table notifications    enable row level security;

-- tenants: public can read active tenants (public booking page);
-- owner/admin can update their own.
create policy tenants_public_read on tenants for select
  using (status = 'active');
create policy tenants_member_update on tenants for update
  using (id = current_tenant_id() and current_user_role() in ('owner','admin'));

-- users: members see users of their own tenant; users update themselves.
create policy users_member_read on users for select
  using (tenant_id = current_tenant_id());
create policy users_self_update on users for update
  using (id = auth.uid());

-- services & staff: public reads active rows; members full access.
create policy services_public_read on services for select
  using (is_active = true or tenant_id = current_tenant_id());
create policy services_member_all on services for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('owner','admin'));

create policy staff_public_read on staff for select
  using (is_active = true or tenant_id = current_tenant_id());
create policy staff_member_all on staff for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('owner','admin'));

-- staff_* child tables: scoped through the parent staff row.
create policy staff_services_public_read on staff_services for select using (true);
create policy staff_services_member_all on staff_services for all
  using (staff_id in (select id from staff where tenant_id = current_tenant_id())
         and current_user_role() in ('owner','admin'));

create policy staff_schedules_public_read on staff_schedules for select using (true);
create policy staff_schedules_member_all on staff_schedules for all
  using (staff_id in (select id from staff where tenant_id = current_tenant_id())
         and current_user_role() in ('owner','admin'));

create policy staff_time_off_member_all on staff_time_off for all
  using (staff_id in (select id from staff where tenant_id = current_tenant_id()));

create policy tenant_holidays_public_read on tenant_holidays for select using (true);
create policy tenant_holidays_member_all on tenant_holidays for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('owner','admin'));

-- customers/bookings/payments/notifications: tenant members only.
-- Public booking creation goes through a server route using the secret
-- key (service role bypasses RLS) — anon gets NO direct access.
create policy customers_member_all on customers for all
  using (tenant_id = current_tenant_id());
create policy bookings_member_all on bookings for all
  using (tenant_id = current_tenant_id());
create policy payments_member_all on payments for all
  using (tenant_id = current_tenant_id());
create policy notifications_member_all on notifications for all
  using (tenant_id = current_tenant_id());
