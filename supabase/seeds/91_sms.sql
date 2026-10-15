-- M3. SMS: text history behind the seeded bookings and offers, so the SMS page
-- has threads to open. Loads last: the open prompt looks up its booking by ref.
--
-- Replies copy the templates in booking/logic.ts, buying/logic.ts (checked by
-- src/modules/sms/seed-replies.test.ts) and today's prices (07_pricing.sql).
-- Phones are the clients' from 02_accounts.sql. A FOR booking texts both phones.
--   +639171000001  Amamaros co-op   PRICE, then BOOK ... FOR a member (T2GY7V)
--   +639172000004  Lorna Sumagaysay confirmation of T2GY7V
--   +639171000002  Lumbo co-op      BOOK ... FOR Ramon Jaleco (N4VS6K, the day 14 peak)
--   +639172000013  Ramon Jaleco     confirmation, then the open reschedule question
--                                   to day 15: reply YES N4VS6K or NO N4VS6K
--   +639172000001  Rodel Panes      SELL (SELL01)
--   +639172000003  Ernesto Gallego  SELL (SELL06)
--   +639172000007  Rogelio Palmares BOOK, due today (G4TD7Z)
--   +639173000001  Nonoy Trading    BOOK MILL (S8WE2K)

with d as (select current_date as today)
insert into public.sms_messages (direction, phone, body, status, created_at)
select
  m.direction::public.sms_direction, m.phone, m.body,
  (case when m.direction = 'inbound' then 'processed' else 'sent' end)::public.sms_status,
  now() - m.ago + (case when m.direction = 'outbound' then interval '4 seconds' else interval '0' end)
from d, lateral (
  values
  ('+639171000001', 'inbound',  'PRICE', interval '3 days 2 hours'),
  ('+639171000001', 'outbound', 'IRPC presyo subong: palay PHP 21.00/kg sa 25% MC, drying PHP 1.60/kg, milling PHP 3.30/kg, bugas PHP 47.00/kg. Para sa quote: QUOTE <mc>% <kg>.', interval '3 days 2 hours'),
  ('+639171000001', 'inbound',  'BOOK DRY 2000 ' || to_char(d.today + 1, 'DD/MM') || ' FOR 09172000004', interval '2 days 5 hours'),
  ('+639171000001', 'outbound', 'IRPC: Confirmed na ang booking mo. Code T2GY7V: Drying, 2000 kg sa ' || (d.today + 1) || '. Para i-cancel: CANCEL T2GY7V.', interval '2 days 5 hours'),
  ('+639172000004', 'outbound', 'IRPC: Confirmed na ang booking mo. Code T2GY7V: Drying, 2000 kg sa ' || (d.today + 1) || '. Para i-cancel: CANCEL T2GY7V.', interval '2 days 5 hours'),

  ('+639171000002', 'inbound',  'BOOK DRY 4500 ' || to_char(d.today + 14, 'DD/MM') || ' +2 FOR 09172000013', interval '4 days 1 hour'),
  ('+639171000002', 'outbound', 'IRPC: Confirmed na ang booking mo. Code N4VS6K: Drying, 4500 kg sa ' || (d.today + 14) || '. Para i-cancel: CANCEL N4VS6K.', interval '4 days 1 hour'),
  ('+639172000013', 'outbound', 'IRPC: Confirmed na ang booking mo. Code N4VS6K: Drying, 4500 kg sa ' || (d.today + 14) || '. Para i-cancel: CANCEL N4VS6K.', interval '4 days 1 hour'),

  ('+639172000013', 'outbound', 'IRPC: Puno na ang ' || to_char(d.today + 14, 'Dy, Mon FMDD') || '. Puwede namon i-saylo ang drying booking mo N4VS6K (4500 kg) sa ' || to_char(d.today + 15, 'Dy, Mon FMDD') || '? Reply YES N4VS6K ukon NO N4VS6K.', interval '40 minutes'),

  ('+639172000001', 'inbound',  'SELL 3000 RC222 ' || to_char(d.today + 7, 'DD/MM'), interval '1 day 3 hours'),
  ('+639172000001', 'outbound', 'IRPC: Nalista na ang offer mo. Code SELL01: 3,000 kg RC222 para sa harvest sa ' || to_char(d.today + 7, 'Mon FMDD, YYYY') || '. I-text ka namon kon may desisyon na ang manager.', interval '1 day 3 hours'),

  ('+639172000003', 'inbound',  'SELL 3500 RC222 ' || to_char(d.today + 5, 'DD/MM'), interval '5 days 4 hours'),
  ('+639172000003', 'outbound', 'IRPC: Nalista na ang offer mo. Code SELL06: 3,500 kg RC222 para sa harvest sa ' || to_char(d.today + 5, 'Mon FMDD, YYYY') || '. I-text ka namon kon may desisyon na ang manager.', interval '5 days 4 hours'),

  ('+639172000007', 'inbound',  'BOOK DRY 2800 ' || to_char(d.today, 'DD/MM'), interval '6 days 2 hours'),
  ('+639172000007', 'outbound', 'IRPC: Confirmed na ang booking mo. Code G4TD7Z: Drying, 2800 kg sa ' || d.today || '. Para i-cancel: CANCEL G4TD7Z.', interval '6 days 2 hours'),

  ('+639173000001', 'inbound',  'BOOK MILL 25000 ' || to_char(d.today + 8, 'DD/MM'), interval '2 days 1 hour'),
  ('+639173000001', 'outbound', 'IRPC: Confirmed na ang booking mo. Code S8WE2K: Milling, 25000 kg sa ' || (d.today + 8) || '. Para i-cancel: CANCEL S8WE2K.', interval '2 days 1 hour')
) as m (phone, direction, body, ago);

-- N4VS6K is reschedule_proposed (04_booking.sql): the question above waits on this prompt.
-- Open until the booking's day, not the 24 h default, so the demo works days after a reset.
insert into public.sms_prompts (phone, ref, kind, payload, expires_at)
select c.phone, b.ref, 'reschedule', jsonb_build_object('bookingId', b.id, 'date', b.proposed_date),
  b.scheduled_date::timestamp at time zone 'Asia/Manila'
from public.bookings b
join public.clients c on c.id = b.client_id
where b.ref = 'N4VS6K';
