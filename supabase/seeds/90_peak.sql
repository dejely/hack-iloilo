-- Peak demo scenario (#44): what the capacity page and M10 show in the pitch.
--
-- Dryer day is 112 t (5 × 10 t + 6 t, 2 cycles); idle is under 30% (33.6 t).
--   Days 0–16   steady trader drying so no day before the peak reads idle.
--   Day 14      30 t over: 130 t booked + 12 t accepted offer (SELL08, 05_buying.sql).
--               Three flexible bookings (12 + 10 + 8 t) can move to clear it (M10).
--               N4VS6K (4.5 t, 04_booking.sql) was already asked to move to day 15,
--               so the chart shows 34.5 t over while M10 counts it on day 15.
--   Days 17–20  idle: nothing booked, only the forecast.
-- Fillers go to traders so farmers without bookings stay fill-idle recipients
-- (every co-op already has an open booking, so none are).

-- current_date is the session's date; the demo runs on Manila days.
set time zone 'Asia/Manila';

insert into public.bookings (
  facility_id, ref, service, client_id, booked_by_phone, channel,
  est_kg, preferred_date, flex_days, scheduled_date, status
)
select
  'f0000000-0000-0000-0000-000000000001', v.ref, 'drying', c.id,
  coalesce(v.booked_by_phone, c.phone), v.channel::public.booking_channel,
  v.est_kg, current_date + v.day, v.flex_days, current_date + v.day, 'confirmed'
from (
  values
  -- Steady load before the peak.
  ('A2TF5N', 'c2000000-0000-0000-0000-000000000001', null,            'staff', 35000,  0, 0),
  ('B3UG6P', 'c2000000-0000-0000-0000-000000000002', null,            'sms',   25000,  2, 0),
  ('C4VH7Q', 'c2000000-0000-0000-0000-000000000003', null,            'sms',   28000,  3, 0),
  ('D5WJ8R', 'c2000000-0000-0000-0000-000000000001', null,            'staff', 45000,  4, 0),
  ('E6XK9S', 'c2000000-0000-0000-0000-000000000002', null,            'sms',   42000,  5, 0),
  ('F7YL2T', 'c2000000-0000-0000-0000-000000000003', null,            'staff', 50000,  6, 0),
  ('G8ZM3U', 'c2000000-0000-0000-0000-000000000001', null,            'sms',   55000,  7, 0),
  ('H9AN4V', 'c2000000-0000-0000-0000-000000000002', null,            'staff', 48000,  8, 0),
  ('J2BP5W', 'c2000000-0000-0000-0000-000000000003', null,            'sms',   52000,  9, 0),
  ('K3CQ6X', 'c2000000-0000-0000-0000-000000000001', null,            'staff', 60000, 10, 0),
  ('L4DR7Y', 'c2000000-0000-0000-0000-000000000002', null,            'sms',   58000, 11, 0),
  ('M5ES8Z', 'c2000000-0000-0000-0000-000000000003', null,            'staff', 62000, 12, 0),
  ('N6FT9A', 'c2000000-0000-0000-0000-000000000001', null,            'sms',   70000, 13, 0),
  ('P7GU2B', 'c2000000-0000-0000-0000-000000000002', null,            'staff', 65000, 15, 0),
  ('Q8HV3C', 'c2000000-0000-0000-0000-000000000003', null,            'sms',   50000, 16, 0),
  -- The peak.
  ('D4KR7A', 'c0000000-0000-0000-0000-000000000001', null,            'staff', 30000, 14, 0),
  ('E6MW2B', 'c0000000-0000-0000-0000-000000000002', null,            'sms',   25000, 14, 0),
  ('G8PX3C', 'c0000000-0000-0000-0000-000000000003', null,            'sms',   20000, 14, 0),
  ('H2QY4D', 'c2000000-0000-0000-0000-000000000001', null,            'sms',   18000, 14, 0),
  ('J3RZ5E', 'c2000000-0000-0000-0000-000000000003', null,            'staff',  7000, 14, 0),
  ('K4SA6F', 'c1000000-0000-0000-0000-000000000017', null,            'sms',   12000, 14, 2),
  ('L5TB7G', 'c1000000-0000-0000-0000-000000000023', null,            'sms',   10000, 14, 3),
  ('M6UC8H', 'c1000000-0000-0000-0000-000000000026', '+639171000001', 'sms',    8000, 14, 1)
) as v (ref, client_id, booked_by_phone, channel, est_kg, day, flex_days)
join public.clients c on c.id = v.client_id::uuid;
