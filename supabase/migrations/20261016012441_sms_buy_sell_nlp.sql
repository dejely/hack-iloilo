-- Preserve a farmer's classification when they also buy rice.
alter table public.rice_orders
  add column buyer_name text check (buyer_name is null or length(trim(buyer_name)) between 1 and 100),
  add column buyer_type public.buyer_type,
  add column sms_prompt_id uuid unique references public.sms_prompts(id);

-- Confirmation retries reuse their saved transaction, including after a send fails.
alter table public.sell_offers
  add column sms_prompt_id uuid unique references public.sms_prompts(id);

-- Serialize this sender's SMS request allowance. A retried confirmation keeps
-- its original attempt; no synthetic shared IP bucket penalizes other senders.
create function public.reserve_sms_rice_request(p_phone text, p_prompt_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.sms_prompts
    where id = p_prompt_id and phone = p_phone
      and kind = 'ai_confirm' and status = 'accepted'
      and payload ->> 'keyword' = 'BUY'
  ) then
    raise exception 'Rice request requires the sender confirmation';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sms-rice:' || p_phone, 0));
  if exists (select 1 from public.request_attempts where phone = p_phone and ip = 'sms:' || p_prompt_id::text) then
    return true;
  end if;
  if (select count(*) from public.request_attempts where phone = p_phone and created_at > now() - interval '60 minutes') >= 3 then
    return false;
  end if;
  insert into public.request_attempts (phone, ip) values (p_phone, 'sms:' || p_prompt_id::text);
  return true;
end;
$$;
revoke all on function public.reserve_sms_rice_request(text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_sms_rice_request(text, uuid) to service_role;
