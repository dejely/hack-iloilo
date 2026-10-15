-- M4. Booking: a handful of upcoming drying and milling bookings.
--
-- Refs are fixed (6 characters, no 0/O/1/I). Clients come from 02_accounts.sql.
-- `FOR` bookings are made by a co-op's phone on behalf of a member farmer.

-- current_date is the session's date; the demo runs on Manila days.
set time zone 'Asia/Manila';

insert into public.bookings (
  facility_id, ref, service, client_id, booked_by_phone, channel,
  est_kg, preferred_date, flex_days, scheduled_date, proposed_date, status
)
select
  'f0000000-0000-0000-0000-000000000001', v.ref, v.service::public.service, c.id,
  coalesce(v.booked_by_phone, c.phone), v.channel::public.booking_channel,
  v.est_kg, current_date + v.day, v.flex_days, current_date + v.scheduled_day,
  case when v.status = 'reschedule_proposed' then current_date + v.scheduled_day + 1 end,
  v.status::public.booking_status
from (
  values
  -- Due today, for checking in by ref at the gate.
  ('G4TD7Z', 'drying',  'c1000000-0000-0000-0000-000000000007', null,            'sms',    2800, 0, 0, 0, 'confirmed'),
  ('V3NB8H', 'milling', 'c1000000-0000-0000-0000-000000000009', null,            'staff',  5000, 0, 1, 0, 'confirmed'),
  ('K7P2QX', 'drying',  'c0000000-0000-0000-0000-000000000002', null,            'sms',   12000, 1, 3, 1, 'confirmed'),
  ('M4RT8B', 'drying',  'c0000000-0000-0000-0000-000000000001', null,            'sms',   10000, 1, 2, 1, 'confirmed'),
  ('H3WN6C', 'drying',  'c1000000-0000-0000-0000-000000000003', null,            'sms',    8500, 1, 3, 1, 'confirmed'),
  ('P9DL5S', 'drying',  'c1000000-0000-0000-0000-000000000012', null,            'staff',  2500, 1, 0, 1, 'confirmed'),
  ('T2GY7V', 'drying',  'c1000000-0000-0000-0000-000000000004', '+639171000001', 'sms',    2000, 1, 0, 1, 'confirmed'),
  ('Q6HZ4T', 'drying',  'c1000000-0000-0000-0000-000000000005', null,            'sms',    3000, 1, 0, 1, 'confirmed'),
  ('U8CW2L', 'drying',  'c1000000-0000-0000-0000-000000000022', null,            'staff',  1500, 1, 1, 1, 'confirmed'),
  ('Z8KE3F', 'drying',  'c2000000-0000-0000-0000-000000000001', null,            'sms',    6000, 2, 2, 2, 'confirmed'),
  ('B5QJ9R', 'drying',  'c0000000-0000-0000-0000-000000000003', null,            'sms',    9000, 2, 0, 2, 'confirmed'),
  ('W6UC4N', 'drying',  'c1000000-0000-0000-0000-000000000021', null,            'staff',  3500, 2, 1, 2, 'cancelled'),
  ('F7AX2M', 'drying',  'c1000000-0000-0000-0000-000000000015', null,            'sms',    4000, 3, 1, 3, 'confirmed'),
  ('R3EH8P', 'drying',  'c1000000-0000-0000-0000-000000000016', null,            'staff',  3500, 3, 0, 3, 'confirmed'),
  -- On the day 14 peak (90_peak.sql), already asked to move to day 15 (91_sms.sql).
  ('N4VS6K', 'drying',  'c1000000-0000-0000-0000-000000000013', '+639171000002', 'sms',    4500, 14, 2, 14, 'reschedule_proposed'),
  ('C9LT5G', 'milling', 'c2000000-0000-0000-0000-000000000002', null,            'sms',   15000, 2, 1, 2, 'confirmed'),
  ('J2PB7D', 'milling', 'c0000000-0000-0000-0000-000000000001', null,            'staff', 20000, 4, 3, 4, 'confirmed'),
  -- Mill peak: day 8 is 10.4 t over the 49.6 t mill day (M10 store now, mill later).
  ('P7VD9J', 'milling', 'c0000000-0000-0000-0000-000000000002', null,            'staff', 35000, 8, 0, 8, 'confirmed'),
  ('S8WE2K', 'milling', 'c2000000-0000-0000-0000-000000000001', null,            'sms',   25000, 8, 0, 8, 'confirmed'),
  ('Y5MR3W', 'milling', 'c2000000-0000-0000-0000-000000000003', null,            'sms',    8000, 6, 0, 6, 'confirmed')
) as v (ref, service, client_id, booked_by_phone, channel, est_kg, day, flex_days, scheduled_day, status)
join public.clients c on c.id = v.client_id::uuid;
