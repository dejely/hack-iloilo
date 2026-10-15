-- M3. SMS: plain-language threads the AI read (via_ai), for the SMS page.
-- Replies copy the templates in sms/logic.ts, booking/logic.ts and gate/logic.ts.
--   +639172000002  Josefina Tupas     "pa-dry 40 ka sako" -> confirm -> OO -> L7HB4N
--   +639172000022  Gloria Villanueva  milling without a day -> asked when -> confirm -> X2MF9Q
--   +639172000025  Alfredo Patriarca  confirm -> INDI -> corrected sacks -> OO -> R8KD3W
--   +639172000021  Edgardo Bermejo    cancel in a sentence -> confirm -> OO (W6UC4N, 04_booking.sql)
--   +639172000017  Romeo Gonzaga      asks his place in line (waiting #2, 06_gate.sql)

-- current_date is the session's date; the demo runs on Manila days.
set time zone 'Asia/Manila';

-- Bookings made through these threads. Days stay clear of the day 8 mill and
-- day 14 dryer peaks' own bookings and of the idle days 17–20 (90_peak.sql).
insert into public.bookings (
  facility_id, ref, service, client_id, booked_by_phone, channel,
  est_kg, preferred_date, flex_days, scheduled_date, status, created_at
)
select
  'f0000000-0000-0000-0000-000000000001', v.ref, v.service::public.service, c.id, c.phone, 'sms',
  v.est_kg, current_date + v.day, v.flex_days, current_date + v.day, 'confirmed', v.at
from (
  values
  ('L7HB4N', 'drying',  'c1000000-0000-0000-0000-000000000002', 2000, 3, 0, current_date - 2 + time '07:12'),
  ('X2MF9Q', 'milling', 'c1000000-0000-0000-0000-000000000022', 1500, 6, 0, current_date - 1 + time '13:20'),
  ('R8KD3W', 'drying',  'c1000000-0000-0000-0000-000000000025', 6000, 8, 2, current_date - 1 + time '16:15')
) as v (ref, service, client_id, est_kg, day, flex_days, at)
join public.clients c on c.id = v.client_id::uuid;

-- Hiligaynon weekday of a date, as farmers write it.
create function pg_temp.adlaw(d date) returns text language sql as $$
  select (array['Lunes', 'Martes', 'Miyerkoles', 'Huwebes', 'Biernes', 'Sabado', 'Domingo'])
    [extract(isodow from d)::int]
$$;

with d as (select current_date as today)
insert into public.sms_messages (direction, phone, body, via_ai, status, created_at)
select
  m.direction::public.sms_direction, m.phone, m.body,
  m.direction = 'inbound',
  (case when m.direction = 'inbound' then 'processed' else 'sent' end)::public.sms_status,
  m.at + (case when m.direction = 'outbound' then interval '5 seconds' else interval '0' end)
from d, lateral (
  values
  ('+639172000002', 'inbound',  'Maayong aga! Pa-dry ko 40 ka sako nga palay sa ' || pg_temp.adlaw(d.today + 3) || ', pwede?', current_date - 2 + time '07:12'),
  ('+639172000002', 'outbound', 'IRPC: Para sigurado, gusto mo mag-book sang drying para sa 2,000 kg sa ' || to_char(d.today + 3, 'Dy, Mon FMDD') || '? Husto bala?', current_date - 2 + time '07:12'),
  ('+639172000002', 'inbound',  'oo sige salamat', current_date - 2 + time '07:15'),
  ('+639172000002', 'outbound', 'IRPC: Confirmed na ang booking mo. Code L7HB4N: Drying, 2000 kg sa ' || (d.today + 3) || '. Para i-cancel: CANCEL L7HB4N.', current_date - 2 + time '07:15'),

  ('+639172000022', 'inbound',  'Gd pm, pa-galing ko 1500 kilos nga palay. Uga na', current_date - 1 + time '13:20'),
  ('+639172000022', 'outbound', 'IRPC: San-o ka maabot? I-text ang adlaw/bulan, pareho sang 20/10.', current_date - 1 + time '13:20'),
  ('+639172000022', 'inbound',  'sa sunod nga ' || pg_temp.adlaw(d.today + 6) || ' lang', current_date - 1 + time '13:28'),
  ('+639172000022', 'outbound', 'IRPC: Para sigurado, gusto mo mag-book sang milling para sa 1,500 kg sa ' || to_char(d.today + 6, 'Dy, Mon FMDD') || '? Husto bala?', current_date - 1 + time '13:28'),
  ('+639172000022', 'inbound',  'Ho', current_date - 1 + time '13:30'),
  ('+639172000022', 'outbound', 'IRPC: Confirmed na ang booking mo. Code X2MF9Q: Milling, 1500 kg sa ' || (d.today + 6) || '. Para i-cancel: CANCEL X2MF9Q.', current_date - 1 + time '13:30'),

  ('+639172000025', 'inbound',  'pa dry kami 100 ka sako sa ' || to_char(d.today + 8, 'DD/MM') || ', pwede man 2 adlaw antes ukon after', current_date - 1 + time '16:05'),
  ('+639172000025', 'outbound', 'IRPC: Para sigurado, gusto mo mag-book sang drying para sa 5,000 kg sa ' || to_char(d.today + 8, 'Dy, Mon FMDD') || ', puwede 2 ka adlaw nga mas temprano ukon mas ulihi? Husto bala?', current_date - 1 + time '16:05'),
  ('+639172000025', 'inbound',  'indi', current_date - 1 + time '16:11'),
  ('+639172000025', 'outbound', 'IRPC: Sige, wala kami gin-save.', current_date - 1 + time '16:11'),
  ('+639172000025', 'inbound',  '120 ka sako gali, sa ' || to_char(d.today + 8, 'DD/MM') || ' gihapon, +2 adlaw', current_date - 1 + time '16:13'),
  ('+639172000025', 'outbound', 'IRPC: Para sigurado, gusto mo mag-book sang drying para sa 6,000 kg sa ' || to_char(d.today + 8, 'Dy, Mon FMDD') || ', puwede 2 ka adlaw nga mas temprano ukon mas ulihi? Husto bala?', current_date - 1 + time '16:13'),
  ('+639172000025', 'inbound',  'OO tama na', current_date - 1 + time '16:15'),
  ('+639172000025', 'outbound', 'IRPC: Confirmed na ang booking mo. Code R8KD3W: Drying, 6000 kg sa ' || (d.today + 8) || '. Para i-cancel: CANCEL R8KD3W.', current_date - 1 + time '16:15'),

  ('+639172000021', 'inbound',  'Indi na ko makadala sa ' || pg_temp.adlaw(d.today + 2) || ', basa pa ang humay tungod sa ulan. I-cancel lang anay ang W6UC4N', current_date - 1 + time '18:40'),
  ('+639172000021', 'outbound', 'IRPC: Para sigurado, gusto mo i-cancel ang booking W6UC4N? Husto bala?', current_date - 1 + time '18:40'),
  ('+639172000021', 'inbound',  'oo', current_date - 1 + time '18:45'),
  ('+639172000021', 'outbound', 'IRPC: Na-cancel na ang booking W6UC4N.', current_date - 1 + time '18:45'),

  ('+639172000017', 'inbound',  'Diri na ko sa gate. Pang-ilan na ko sa pila?', now() - interval '30 minutes'),
  ('+639172000017', 'outbound', 'IRPC: Drying: #2 ka sa linya.', now() - interval '30 minutes')
) as m (phone, direction, body, at);

-- The confirm questions above were answered; the follow-up question was filled.
insert into public.sms_prompts (phone, ref, kind, payload, status, expires_at, created_at)
select v.phone, v.ref, v.kind::public.sms_prompt_kind, v.payload::jsonb, v.status::public.sms_prompt_status,
  v.at + interval '24 hours', v.at
from (
  values
  ('+639172000002', 'QA7K2M', 'ai_confirm', '{"keyword":"BOOK"}', 'accepted', current_date - 2 + time '07:12'),
  ('+639172000022', 'QB3N8P', 'ai_fill',    '{"keyword":"BOOK","missing":["dayMonth"],"asks":1}', 'accepted', current_date - 1 + time '13:20'),
  ('+639172000022', 'QC5R4T', 'ai_confirm', '{"keyword":"BOOK"}', 'accepted', current_date - 1 + time '13:28'),
  ('+639172000025', 'QD9W6X', 'ai_confirm', '{"keyword":"BOOK"}', 'declined', current_date - 1 + time '16:05'),
  ('+639172000025', 'QE2Y7Z', 'ai_confirm', '{"keyword":"BOOK"}', 'accepted', current_date - 1 + time '16:13'),
  ('+639172000021', 'QF4H3J', 'ai_confirm', '{"keyword":"CANCEL","args":{"ref":"W6UC4N"}}', 'accepted', current_date - 1 + time '18:40')
) as v (phone, ref, kind, payload, status, at);
