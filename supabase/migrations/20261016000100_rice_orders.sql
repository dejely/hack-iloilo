-- M11. Rice Buying: buyers request milled rice for a pickup date, like a sell
-- offer in reverse. Staff confirm; the dispatch sets the price. No payment.

create type public.rice_order_status as enum (
  'requested', 'accepted', 'declined', 'cancelled', 'picked_up'
);

create table public.rice_orders (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id),
  ref text not null unique check (ref ~ '^[A-Z0-9]{6}$'),
  client_id uuid not null references public.clients (id),
  booked_by_phone text not null,
  kg integer not null check (kg > 0),
  pickup_date date not null,
  status public.rice_order_status not null default 'requested',
  -- The sale recorded at pickup: links the buyer to the batch the rice came from.
  dispatch_id uuid references public.dispatches (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rice_orders_pickup_idx on public.rice_orders (facility_id, status, pickup_date);
create index rice_orders_client_id_idx on public.rice_orders (client_id);

create trigger rice_orders_set_updated_at before update on public.rice_orders
for each row execute function public.set_updated_at();

alter table public.rice_orders enable row level security;

-- Public /buy requests per IP and phone, so a script can't use the form to
-- text many numbers on the gateway SIM's credit (basic abuse guard).
create table public.request_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index request_attempts_ip_created_idx
  on public.request_attempts (ip, created_at desc);
create index request_attempts_phone_created_idx
  on public.request_attempts (phone, created_at desc);

create trigger request_attempts_set_updated_at before update on public.request_attempts
for each row execute function public.set_updated_at();

alter table public.request_attempts enable row level security;
