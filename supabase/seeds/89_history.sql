-- Demo history: about 14 weeks of IRPC operations before today, so every page
-- reads like a plant that has run on the platform all season.
--
--   prices        a price change every 2–3 weeks (the trend chart's 12 points)
--   bookings      past bookings: arrived, no-show, cancelled
--   sell_offers   past offers: arrived, declined, withdrawn
--   queue_entries one finished gate visit per batch, plus a few who left
--   batches       custom drying, custom milling and IRPC buying, each with its
--                 full trail; IRPC palay received lately is still in storage
--                 and recent rice is still on hand
--   purchases     IRPC's palay buys at the price of the day, with deductions
--   dispatches    rice sales to buyers and owners' pickups
--   rice_orders   buyer requests behind some sales, a few declined
--   sms_messages  the texts behind the last three weeks
--   facilities    a buying budget for the season, about two-thirds used
--
-- Volumes follow the wet-season harvest (busier Sep–Oct). Random but fixed:
-- setseed() makes every reset produce the same history. Nothing here is dated
-- today or later, so the scenarios in 04–91 are unchanged.

-- current_date is the session's date; the demo runs on Manila days.
set time zone 'Asia/Manila';

-- Price history, oldest first. Today's row is 07_pricing.sql.
insert into public.prices (
  facility_id, effective_date, buy_base_minor_per_kg, drying_fee_minor_per_kg,
  milling_fee_minor_per_kg, rice_minor_per_kg, created_at, updated_at
)
select
  'f0000000-0000-0000-0000-000000000001', current_date - v.ago, v.buy, v.dry, v.mill, v.rice,
  (current_date - v.ago) + time '07:30', (current_date - v.ago) + time '07:30'
from (
  values
  (160, 2250, 150, 300, 5000),
  (138, 2300, 150, 300, 5000),
  (117, 2350, 150, 320, 5100),
  ( 96, 2400, 150, 320, 5100),
  ( 80, 2350, 160, 320, 5000),
  ( 66, 2300, 160, 330, 4950),
  ( 52, 2250, 160, 330, 4900),
  ( 38, 2200, 160, 330, 4850),
  ( 27, 2150, 160, 330, 4800),
  ( 17, 2100, 160, 330, 4750),
  (  8, 2050, 160, 330, 4700)
) as v (ago, buy, dry, mill, rice);

-- Clients have been on the books for a while.
update public.clients
set created_at = now() - make_interval(days => 120 + abs(hashtext(id::text)) % 500)
where created_at > now() - interval '1 day';

-- Batches from 06_gate.sql were received before today, not at reset time.
update public.batches
set created_at = least(coalesce(dry_start, now()), coalesce(mill_start, now())) - interval '1 hour'
where batch_no not like to_char(current_date, 'YYMMDD') || '-%'
  and created_at > now() - interval '1 hour';

-- A fresh six-character ref (no 0/O/1/I) unused by bookings, offers and orders.
create function pg_temp.demo_ref() returns text language plpgsql as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  r text;
begin
  loop
    r := '';
    for i in 1..6 loop
      r := r || substr(abc, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.bookings where ref = r)
      and not exists (select 1 from public.sell_offers where ref = r)
      and not exists (select 1 from public.rice_orders where ref = r);
  end loop;
  return r;
end $$;

-- `2,500`
create function pg_temp.kg(n integer) returns text language sql as $$
  select trim(to_char(n, 'FM999,999,990'))
$$;

-- `PHP 52,500.00`
create function pg_temp.php(minor bigint) returns text language sql as $$
  select 'PHP ' || trim(to_char(minor / 100.0, 'FM999,999,990.00'))
$$;

-- Manila wall-clock time on day `d`, `h` hours after midnight.
create function pg_temp.at(d date, h double precision) returns timestamptz language sql as $$
  select (d + make_interval(secs => h * 3600))::timestamp at time zone 'Asia/Manila'
$$;

do $$
declare
  fac constant uuid := 'f0000000-0000-0000-0000-000000000001';
  today constant date := current_date;
  sms_since constant timestamptz := now() - interval '21 days';
  farmers uuid[];
  coops uuid[];
  traders uuid[];
  buyers uuid[];
  dryers uuid[];
  dryer_kg int[];
  mill uuid;
  mill_kgph int;
  varieties uuid[];
  variety_codes text[];
  or_no int := 3820;
  voucher_no int := 0;
  d date;
  n int;
  seq int;
  i int;
  r double precision;
  bk text;
  cl uuid;
  cl_phone text;
  cl_kind text;
  net int;
  mc numeric;
  mc_out numeric;
  dried int;
  rice int;
  bags int;
  t_in timestamptz;
  t_start timestamptz;
  t_dry_start timestamptz;
  t_dry_end timestamptz;
  t_mill_start timestamptz;
  t_mill_end timestamptz;
  t_out timestamptz;
  stage public.batch_stage;
  owner public.batch_ownership;
  svc public.service;
  dryer_i int;
  var_i int;
  booking uuid;
  offer uuid;
  entry uuid;
  batch uuid;
  disp uuid;
  bref text;
  batch_no text;
  p record;
  price_kg int;
  paid int;
  ded jsonb;
  dmg numeric;
  imm numeric;
  frn numeric;
  left_kg int;
  chunk int;
  buyer uuid;
  buyer_type public.buyer_type;
  buyer_phone text;
  sale_price int;
  created timestamptz;
begin
  perform setseed(0.2026);

  select array_agg(id order by id) into farmers from public.clients where kind = 'farmer';
  select array_agg(id order by id) into coops from public.clients where kind = 'coop';
  select array_agg(id order by id) into traders from public.clients where kind = 'trader';
  select array_agg(id order by id) into buyers from public.clients where kind = 'buyer';
  select array_agg(id order by code), array_agg(capacity_kg order by code)
    into dryers, dryer_kg
    from public.machines where facility_id = fac and type = 'dryer';
  select id, kg_per_hour into mill, mill_kgph
    from public.machines where facility_id = fac and type = 'mill' limit 1;
  select array_agg(id order by code), array_agg(code order by code)
    into varieties, variety_codes
    from public.varieties where code <> 'OTHER';

  for d in select generate_series(today - 98, today - 1, interval '1 day')::date loop
    -- Batches a day: the wet-season harvest peaks in Sep–Oct; Sundays are quiet.
    n := round(
      (case extract(month from d)
        when 7 then 1.5 when 8 then 2.5 when 9 then 4.5 when 10 then 6
        when 11 then 4 else 2 end)
      * (0.6 + random() * 0.8)
      * (case when extract(isodow from d) = 7 then 0.3 else 1 end)
    );
    select coalesce(max(substr(b.batch_no, 8)::int), 0) into seq
      from public.batches b where b.batch_no like to_char(d, 'YYMMDD') || '-%';

    -- Bookings that never arrived.
    if random() < 0.35 then
      cl := farmers[1 + floor(random() * array_length(farmers, 1))::int];
      insert into public.bookings (
        facility_id, ref, service, client_id, booked_by_phone, channel, est_kg,
        preferred_date, flex_days, scheduled_date, status, created_at, updated_at
      )
      select fac, pg_temp.demo_ref(), 'drying', c.id, c.phone,
        (case when random() < 0.7 then 'sms' else 'staff' end)::public.booking_channel,
        (10 + floor(random() * 40)::int) * 100, d, floor(random() * 3)::int, d,
        (case when random() < 0.45 then 'no_show' else 'cancelled' end)::public.booking_status,
        pg_temp.at(d - 3 - floor(random() * 6)::int, 8 + random() * 10), pg_temp.at(d, 17)
      from public.clients c where c.id = cl;
    end if;

    -- Offers IRPC passed on, or the farmer withdrew.
    if random() < 0.2 then
      cl := farmers[1 + floor(random() * array_length(farmers, 1))::int];
      var_i := 1 + floor(random() * array_length(varieties, 1))::int;
      insert into public.sell_offers (
        facility_id, ref, client_id, booked_by_phone, variety_id, est_kg,
        harvest_date, status, created_at, updated_at
      )
      select fac, pg_temp.demo_ref(), c.id, c.phone, varieties[var_i],
        (15 + floor(random() * 50)::int) * 100, d,
        (case when random() < 0.65 then 'declined' else 'withdrawn' end)::public.sell_offer_status,
        pg_temp.at(d - 6 - floor(random() * 8)::int, 8 + random() * 10),
        pg_temp.at(d - 4, 10)
      from public.clients c where c.id = cl;
    end if;

    -- Someone who checked in and left before being served.
    if random() < 0.15 then
      t_in := pg_temp.at(d, 7 + random() * 7);
      insert into public.queue_entries (
        facility_id, service, client_id, ownership, est_kg, checked_in_at, status,
        created_at, updated_at
      ) values (
        fac, 'drying', farmers[1 + floor(random() * array_length(farmers, 1))::int], 'custom',
        (10 + floor(random() * 30)::int) * 100, t_in, 'left', t_in, t_in + interval '2 hours'
      );
    end if;

    for i in 1..n loop
      seq := seq + 1;
      batch_no := to_char(d, 'YYMMDD') || '-' || lpad(seq::text, 3, '0');
      r := random();
      bk := case when r < 0.4 then 'buy' when r < 0.75 then 'dry' else 'mill' end;
      owner := (case when bk = 'buy' then 'irpc' else 'custom' end)::public.batch_ownership;
      svc := (case when bk = 'mill' then 'milling' else 'drying' end)::public.service;

      r := random();
      if bk = 'buy' then
        cl := case when r < 0.75 then farmers[1 + floor(random() * array_length(farmers, 1))::int]
          else coops[1 + floor(random() * array_length(coops, 1))::int] end;
      elsif bk = 'dry' then
        cl := case when r < 0.55 then farmers[1 + floor(random() * array_length(farmers, 1))::int]
          when r < 0.75 then coops[1 + floor(random() * array_length(coops, 1))::int]
          else traders[1 + floor(random() * array_length(traders, 1))::int] end;
      else
        cl := case when r < 0.4 then farmers[1 + floor(random() * array_length(farmers, 1))::int]
          when r < 0.65 then coops[1 + floor(random() * array_length(coops, 1))::int]
          else traders[1 + floor(random() * array_length(traders, 1))::int] end;
      end if;
      select phone, c.kind::text into cl_phone, cl_kind from public.clients c where c.id = cl;

      net := case cl_kind
        when 'farmer' then (16 + floor(random() * 80)::int) * 50
        when 'coop' then (120 + floor(random() * 80)::int) * 50
        else (80 + floor(random() * 120)::int) * 50 end;
      bags := ceil(net / 50.0);
      mc := case when bk = 'mill' then round((13.5 + random())::numeric, 1)
        else round((19.5 + random() * 6)::numeric, 1) end;
      var_i := 1 + floor(random() * array_length(varieties, 1))::int;

      t_in := pg_temp.at(d, 6.5 + random() * 8.5);
      t_start := t_in + make_interval(mins => 10 + floor(random() * 60)::int);

      -- How the client came: a booking (custom) or an accepted offer (IRPC).
      booking := null;
      offer := null;
      if bk <> 'buy' and random() < 0.75 then
        bref := pg_temp.demo_ref();
        created := least(t_in - interval '1 day', pg_temp.at(d - 1 - floor(random() * 9)::int, 7 + random() * 12));
        insert into public.bookings (
          facility_id, ref, service, client_id, booked_by_phone, channel, est_kg,
          preferred_date, flex_days, scheduled_date, status, created_at, updated_at
        ) values (
          fac, bref, svc, cl, cl_phone,
          (case when random() < 0.65 then 'sms' else 'staff' end)::public.booking_channel,
          greatest(round((net * (0.85 + random() * 0.3))::numeric, -2)::int, 100), d,
          floor(random() * 3)::int, d, 'arrived', created, t_in
        ) returning id into booking;
        if created >= sms_since and random() < 0.65 then
          insert into public.sms_messages (direction, phone, body, status, created_at, updated_at)
          values
            ('inbound', cl_phone,
             'BOOK ' || (case when svc = 'drying' then 'DRY' else 'MILL' end) || ' '
               || (select est_kg from public.bookings where id = booking) || ' ' || to_char(d, 'DD/MM'),
             'processed', created, created),
            ('outbound', cl_phone,
             'IRPC: Confirmed na ang booking mo. Code ' || bref || ': '
               || (case when svc = 'drying' then 'Drying' else 'Milling' end) || ', '
               || (select est_kg from public.bookings where id = booking) || ' kg sa ' || d || '. Para i-cancel: CANCEL ' || bref || '.',
             'sent', created + interval '4 seconds', created + interval '4 seconds');
        end if;
      elsif bk = 'buy' and random() < 0.55 then
        bref := pg_temp.demo_ref();
        created := pg_temp.at(d - 4 - floor(random() * 10)::int, 7 + random() * 12);
        insert into public.sell_offers (
          facility_id, ref, client_id, booked_by_phone, variety_id, est_kg,
          harvest_date, status, created_at, updated_at
        ) values (
          fac, bref, cl, cl_phone, varieties[var_i], round((net * (0.85 + random() * 0.3))::numeric, -2),
          d, 'arrived', created, t_in
        ) returning id into offer;
        if created >= sms_since then
          insert into public.sms_messages (direction, phone, body, status, created_at, updated_at)
          select v.dir::public.sms_direction, cl_phone, v.body,
            (case when v.dir = 'inbound' then 'processed' else 'sent' end)::public.sms_status,
            v.at, v.at
          from public.sell_offers o, lateral (
            values
            ('inbound', 'SELL ' || o.est_kg || ' ' || variety_codes[var_i] || ' ' || to_char(d, 'DD/MM'), created),
            ('outbound', 'IRPC: Nalista na ang offer mo. Code ' || bref || ': ' || pg_temp.kg(o.est_kg) || ' kg '
               || variety_codes[var_i] || ' para sa harvest sa ' || to_char(d, 'Mon FMDD, YYYY')
               || '. I-text ka namon kon may desisyon na ang manager.', created + interval '4 seconds'),
            ('outbound', 'IRPC: Accepted ang offer ' || bref || ': ' || pg_temp.kg(o.est_kg) || ' kg palay, harvest sa '
               || to_char(d, 'Mon FMDD, YYYY') || '. Dal-a sa IRPC, Amamaros, Pototan kag ipakita ang code sa gate.',
             created + make_interval(hours => 3 + floor(random() * 20)::int))
          ) as v (dir, body, at)
          where o.id = offer;
        end if;
      end if;

      insert into public.queue_entries (
        facility_id, service, client_id, booking_id, offer_id, ownership, est_kg,
        checked_in_at, started_at, finished_at, status, created_at, updated_at
      ) values (
        fac, svc, cl, booking, offer, owner, greatest(round(net, -2)::int, 100), t_in, t_start,
        t_start + make_interval(mins => 15 + floor(random() * 45)::int), 'done', t_in, t_start
      ) returning id into entry;

      -- Drying (custom drying and IRPC palay): one dryer, 8-hour cycle.
      dryer_i := null; t_dry_start := null; t_dry_end := null; mc_out := null; dried := null;
      if bk <> 'mill' then
        loop
          dryer_i := 1 + floor(random() * array_length(dryers, 1))::int;
          exit when dryer_kg[dryer_i] >= least(net, 10000);
        end loop;
        t_dry_start := t_start + make_interval(mins => 30 + floor(random() * 90)::int);
        t_dry_end := t_dry_start + interval '8 hours';
        mc_out := round((13.5 + random() * 0.7)::numeric, 1);
        dried := round(net * (100 - mc) / (100 - mc_out))::int;
      end if;

      -- Milling: custom milling the same day; IRPC palay after some days in storage.
      t_mill_start := null; t_mill_end := null; rice := null;
      if bk = 'mill' then
        t_mill_start := t_start + make_interval(mins => 30 + floor(random() * 150)::int);
      elsif bk = 'buy' then
        t_mill_start := pg_temp.at((t_dry_end at time zone 'Asia/Manila')::date + 2 + floor(random() * 11)::int,
          7 + random() * 7);
        if t_mill_start > now() - interval '6 hours' then t_mill_start := null; end if;
      end if;
      if t_mill_start is not null then
        t_mill_end := t_mill_start + make_interval(secs => coalesce(dried, net) * 3600.0 / mill_kgph);
        rice := round(coalesce(dried, net) * (0.62 + random() * 0.05))::int;
      end if;

      stage := case when t_mill_end is not null then 'milled' when bk = 'buy' then 'stored'
        else 'stored' end;

      dmg := case when bk = 'buy' then round((random() * 3)::numeric, 1) end;
      imm := case when bk = 'buy' then round((random() * 4)::numeric, 1) end;
      frn := case when bk = 'buy' then round((random() * 1)::numeric, 1) end;

      insert into public.batches (
        facility_id, batch_no, queue_entry_id, client_id, ownership, stage, variety_id,
        bags, net_kg, mc, damaged_pct, immature_pct, foreign_pct,
        dryer_id, dry_start, dry_end, mc_out, dried_kg,
        mill_id, mill_start, mill_end, mill_in_kg, rice_kg, byproducts,
        pickup_after_drying, created_at, updated_at
      ) values (
        fac, batch_no, entry, cl, owner, stage, varieties[var_i],
        bags, net, mc, dmg, imm, frn,
        dryers[dryer_i], t_dry_start, t_dry_end, mc_out, dried,
        case when rice is not null then mill end, t_mill_start, t_mill_end,
        case when rice is not null then coalesce(dried, net) end, rice,
        case when rice is not null then jsonb_build_object(
          'bran_kg', round(coalesce(dried, net) * (0.085 + random() * 0.02)),
          'husk_kg', round(coalesce(dried, net) * (0.2 + random() * 0.03))) else '{}'::jsonb end,
        bk = 'dry', t_in, coalesce(t_mill_end, t_dry_end, t_in)
      ) returning id into batch;

      -- Receiving weights confirmed by the client's YES.
      if t_in >= now() - interval '35 days' then
        insert into public.batch_weight_confirmations (
          batch_id, stage, measurements, status, answered_by_phone, answered_at, created_at, updated_at
        ) values (
          batch, 'receiving', jsonb_build_object('bags', bags, 'kg', net, 'mc', mc), 'confirmed',
          cl_phone, t_start + interval '25 minutes', t_start + interval '5 minutes', t_start + interval '25 minutes'
        );
      end if;

      -- IRPC buys the palay at the price of the day (TRD M5 receiving).
      if bk = 'buy' then
        select * into p from public.prices
          where facility_id = fac and effective_date <= d
          order by effective_date desc limit 1;
        price_kg := round(p.buy_base_minor_per_kg * (100 - mc) / (100 - p.buy_reference_mc));
        ded := jsonb_build_object(
          'damaged', round(net * dmg * 0.25 / 100),
          'immature', round(net * imm * 0.10 / 100),
          'foreign', round(net * frn * 1.0 / 100),
          'sack', round(bags * 0.1));
        paid := net - (ded->>'damaged')::int - (ded->>'immature')::int
          - (ded->>'foreign')::int - (ded->>'sack')::int;
        voucher_no := voucher_no + 1;
        insert into public.purchases (
          batch_id, client_id, price_date, net_kg, paid_kg, price_minor_per_kg, total_minor,
          deductions, voucher_ref, created_at, updated_at
        ) values (
          batch, cl, d, net, paid, price_kg, paid::bigint * price_kg, ded,
          'CV-' || to_char(d, 'YYMM') || '-' || lpad(voucher_no::text, 4, '0'),
          t_start + interval '20 minutes', t_start + interval '20 minutes'
        );
        if t_in >= sms_since then
          insert into public.sms_messages (direction, phone, body, status, created_at, updated_at)
          values ('outbound', cl_phone,
            'IRPC: Palay purchase recorded. Paid weight: ' || pg_temp.kg(paid) || ' kg at ' || pg_temp.php(price_kg)
              || '/kg. Total: ' || pg_temp.php(paid::bigint * price_kg) || '.',
            'sent', t_start + interval '21 minutes', t_start + interval '21 minutes');
        end if;
      end if;

      -- Custom owners collect their dried palay or rice.
      if bk <> 'buy' then
        -- During working hours, the same or next day once it's ready.
        t_out := pg_temp.at((coalesce(t_mill_end, t_dry_end) at time zone 'Asia/Manila')::date
          + floor(random() * 2)::int, 7 + random() * 10);
        if t_out < coalesce(t_mill_end, t_dry_end) + interval '1 hour' then
          t_out := pg_temp.at((coalesce(t_mill_end, t_dry_end) at time zone 'Asia/Manila')::date + 1,
            7 + random() * 10);
        end if;
        if t_out < now() - interval '1 hour' then
          insert into public.dispatches (batch_id, buyer_id, kg, price_minor_per_kg, dispatched_at, created_at, updated_at)
          values (batch, cl, coalesce(rice, dried), 0, t_out, t_out, t_out);
          update public.batches set stage = 'dispatched', updated_at = t_out where id = batch;
          if t_out >= sms_since then
            insert into public.sms_messages (direction, phone, body, status, created_at, updated_at)
            values
              ('outbound', cl_phone,
               'IRPC: Pwede na kuhaon / Ready for pickup. Batch ' || batch_no || ': ' || pg_temp.kg(coalesce(rice, dried))
                 || ' kg ' || (case when rice is null then 'dried palay' else 'rice' end) || '. Pick up at IRPC, Amamaros, Pototan.',
               'sent', coalesce(t_mill_end, t_dry_end), coalesce(t_mill_end, t_dry_end)),
              ('outbound', cl_phone,
               'IRPC: Nabaton / Collected: ' || pg_temp.kg(coalesce(rice, dried)) || ' kg. Batch ' || batch_no || '. Salamat!',
               'sent', t_out, t_out);
          end if;
        end if;
      end if;

      -- IRPC rice sold to buyers over the following days; some is still on hand.
      if bk = 'buy' and rice is not null then
        left_kg := rice;
        t_out := t_mill_end;
        while left_kg > 0 loop
          t_out := pg_temp.at((t_out at time zone 'Asia/Manila')::date + floor(random() * 5)::int,
            8 + random() * 8);
          exit when t_out > now() - interval '2 days';
          r := random();
          buyer := case
            when r < 0.35 then buyers[1 + floor(random() * 4)::int]   -- wholesalers A–D
            when r < 0.5 then 'c3000000-0000-0000-0000-000000000021'::uuid  -- ₱20/kg program
            else buyers[5 + floor(random() * (array_length(buyers, 1) - 4))::int] end;
          select c.buyer_type, c.phone into buyer_type, buyer_phone from public.clients c where c.id = buyer;
          chunk := case
            when buyer_type = 'wholesaler' then left_kg
            else least(left_kg, (10 + floor(random() * 50)::int) * 50) end;
          select rice_minor_per_kg into sale_price from public.prices
            where facility_id = fac and effective_date <= (t_out at time zone 'Asia/Manila')::date
            order by effective_date desc limit 1;
          sale_price := sale_price - case buyer_type
            when 'wholesaler' then 200 when 'subsidy_program' then 300
            when 'institutional' then 100 when 'cooperative' then 100 when 'drop_point' then 150
            else 0 end;
          or_no := or_no + 1;
          insert into public.dispatches (batch_id, buyer_id, kg, price_minor_per_kg, or_ref, dispatched_at, created_at, updated_at)
          values (batch, buyer, chunk, sale_price, or_no::text, t_out, t_out, t_out)
          returning id into disp;
          left_kg := left_kg - chunk;

          -- Some sales started as a rice request from /buy.
          if random() < 0.35 then
            bref := pg_temp.demo_ref();
            created := t_out - make_interval(days => 1 + floor(random() * 4)::int, hours => floor(random() * 8)::int);
            insert into public.rice_orders (
              facility_id, ref, client_id, booked_by_phone, kg, pickup_date, status, dispatch_id, created_at, updated_at
            ) values (
              fac, bref, buyer, buyer_phone, chunk, (t_out at time zone 'Asia/Manila')::date, 'picked_up', disp, created, t_out
            );
            if created >= sms_since then
              insert into public.sms_messages (direction, phone, body, status, created_at, updated_at)
              values
                ('outbound', buyer_phone,
                 'IRPC: Nalista na ang request mo. Code ' || bref || ': ' || pg_temp.kg(chunk) || ' kg bugas, kuha sa '
                   || to_char(t_out at time zone 'Asia/Manila', 'Mon FMDD, YYYY') || '. I-text ka namon kon may desisyon na.',
                 'sent', created, created),
                ('outbound', buyer_phone,
                 'IRPC: Accepted ang request ' || bref || ': ' || pg_temp.kg(chunk) || ' kg bugas, kuha sa '
                   || to_char(t_out at time zone 'Asia/Manila', 'Mon FMDD, YYYY') || ' sa IRPC, Amamaros, Pototan. Bayad sa planta.',
                 'sent', created + interval '2 hours', created + interval '2 hours');
            end if;
          end if;
          if t_out >= sms_since then
            insert into public.sms_messages (direction, phone, body, status, created_at, updated_at)
            values ('outbound', buyer_phone,
              'IRPC: Nabaton / Collected: ' || pg_temp.kg(chunk) || ' kg. Batch ' || batch_no || '. Presyo / Price: '
                || pg_temp.php(sale_price) || '/kg. Total: ' || pg_temp.php(chunk::bigint * sale_price) || '. OR ' || or_no || '. Salamat!',
              'sent', t_out, t_out);
          end if;
        end loop;
        if left_kg = 0 then
          update public.batches set stage = 'dispatched', updated_at = t_out where id = batch;
        end if;
      end if;
    end loop;

    -- Rice requests turned down (no stock that day) or cancelled by the buyer.
    if random() < 0.12 then
      buyer := buyers[5 + floor(random() * (array_length(buyers, 1) - 4))::int];
      insert into public.rice_orders (
        facility_id, ref, client_id, booked_by_phone, kg, pickup_date, status, created_at, updated_at
      )
      select fac, pg_temp.demo_ref(), c.id, c.phone, (4 + floor(random() * 30)::int) * 50, d,
        (case when random() < 0.6 then 'declined' else 'cancelled' end)::public.rice_order_status,
        pg_temp.at(d - 2, 9 + random() * 8), pg_temp.at(d - 1, 10)
      from public.clients c where c.id = buyer;
    end if;

    -- A few PRICE checks a week.
    if d >= (sms_since at time zone 'Asia/Manila')::date and random() < 0.5 then
      cl := farmers[1 + floor(random() * array_length(farmers, 1))::int];
      t_in := pg_temp.at(d, 6 + random() * 12);
      select * into p from public.prices
        where facility_id = fac and effective_date <= d order by effective_date desc limit 1;
      insert into public.sms_messages (direction, phone, body, status, created_at, updated_at)
      select v.dir::public.sms_direction, c.phone, v.body,
        (case when v.dir = 'inbound' then 'processed' else 'sent' end)::public.sms_status, v.at, v.at
      from public.clients c, lateral (
        values
        ('inbound', 'PRICE', t_in),
        ('outbound', 'IRPC presyo subong: palay ' || pg_temp.php(p.buy_base_minor_per_kg) || '/kg sa 25% MC, drying '
           || pg_temp.php(p.drying_fee_minor_per_kg) || '/kg, milling ' || pg_temp.php(p.milling_fee_minor_per_kg)
           || '/kg, bugas ' || pg_temp.php(p.rice_minor_per_kg) || '/kg. Para sa quote: QUOTE <mc>% <kg>.',
         t_in + interval '4 seconds')
      ) as v (dir, body, at)
      where c.id = cl;
    end if;
  end loop;
end $$;

-- The season's buying budget, about two-thirds used, from the 1st of last month.
update public.facilities f
set buy_budget_start = date_trunc('month', current_date - 30)::date,
    buy_budget_minor = ceil(
      coalesce((
        select sum(p.total_minor) from public.purchases p
        where p.price_date >= date_trunc('month', current_date - 30)::date
      ), 0) / 0.66 / 50000000.0
    ) * 50000000
where f.id = 'f0000000-0000-0000-0000-000000000001';

reset time zone;
