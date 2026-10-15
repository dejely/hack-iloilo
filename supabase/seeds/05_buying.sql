-- M5. Buying: sell offers (#21). Offered and accepted offers over the next weeks.
-- Facility f0000000-…-01. Clients by fixed id, varieties by code. Refs are fixed
-- demo values matching ^[A-Z0-9]{6}$. Harvest dates are relative to current_date.

-- current_date is the session's date; the demo runs on Manila days.
set time zone 'Asia/Manila';

insert into public.sell_offers (
  facility_id, ref, client_id, booked_by_phone, variety_id, est_kg, harvest_date, status
)
select
  'f0000000-0000-0000-0000-000000000001'::uuid,
  o.ref, o.client_id::uuid, o.phone,
  (select id from public.varieties where code = o.variety_code),
  o.est_kg, current_date + o.in_days, o.status::public.sell_offer_status
from (
  values
    -- Pending offers awaiting a manager decision.
    ('SELL01', 'c1000000-0000-0000-0000-000000000001', '+639172000001', 'RC222',  3000,  7, 'offered'),
    ('SELL02', 'c1000000-0000-0000-0000-000000000002', '+639172000002', 'RC216',  4500, 10, 'offered'),
    ('SELL03', 'c1000000-0000-0000-0000-000000000011', '+639172000011', 'RC160',  2000, 12, 'offered'),
    ('SELL04', 'c1000000-0000-0000-0000-000000000021', '+639172000021', 'HYBRID', 6000, 18, 'offered'),
    ('SELL05', 'c0000000-0000-0000-0000-000000000002', '+639171000002', 'RC222',  9000, 21, 'offered'),
    -- Accepted offers feed capacity as expected arrivals (#33).
    ('SELL06', 'c1000000-0000-0000-0000-000000000003', '+639172000003', 'RC222',  3500,  5, 'accepted'),
    ('SELL07', 'c1000000-0000-0000-0000-000000000012', '+639172000012', 'RC218',  5000,  9, 'accepted'),
    ('SELL08', 'c0000000-0000-0000-0000-000000000001', '+639171000001', 'RC216', 12000, 14, 'accepted'),
    ('SELL09', 'c1000000-0000-0000-0000-000000000022', '+639172000022', 'RC300',  2800, 16, 'accepted'),
    ('SELL10', 'c1000000-0000-0000-0000-000000000004', '+639172000004', 'RC222',  4000, 23, 'accepted')
) as o (ref, client_id, phone, variety_code, est_kg, in_days, status);
