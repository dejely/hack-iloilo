-- M11. Rice Buying: rice requests from seeded buyers over the next days.
-- Facility f0000000-…-01. Buyers by fixed id (02_accounts*.sql); the phone is
-- the buyer's own. Refs are fixed demo values. Pickup dates are relative.

-- current_date is the session's date; the demo runs on Manila days.
set time zone 'Asia/Manila';

insert into public.rice_orders (
  facility_id, ref, client_id, booked_by_phone, kg, pickup_date, status
)
select
  'f0000000-0000-0000-0000-000000000001'::uuid,
  o.ref, c.id, c.phone, o.kg, current_date + o.in_days, o.status::public.rice_order_status
from (
  values
    -- Awaiting a manager decision.
    ('RICE01', 'c3000000-0000-0000-0000-000000000021', 2000, 3, 'requested'),
    ('RICE02', 'c3000000-0000-0000-0000-000000000005',  500, 2, 'requested'),
    ('RICE03', 'c3000000-0000-0000-0000-000000000022', 1500, 5, 'requested'),
    -- Accepted, waiting for pickup.
    ('RICE04', 'c3000000-0000-0000-0000-000000000001', 3000, 1, 'accepted'),
    ('RICE05', 'c3000000-0000-0000-0000-000000000014', 1000, 4, 'accepted'),
    -- Closed.
    ('RICE06', 'c3000000-0000-0000-0000-000000000002', 2500, -2, 'picked_up'),
    ('RICE07', 'c3000000-0000-0000-0000-000000000006',  300, -1, 'declined')
) as o (ref, client_id, kg, in_days, status)
join public.clients c on c.id = o.client_id::uuid;
