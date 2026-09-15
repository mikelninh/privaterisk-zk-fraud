create extension if not exists pgcrypto;

create table if not exists public.privaterisk_v07_decisions (
  decision_id text primary key,
  input_hash text not null unique,
  event_id text not null,
  transaction_id text not null,
  subject_id text not null,
  evaluated_at timestamptz not null,
  policy_version text not null,
  decision text not null check (decision in ('APPROVE','CHALLENGE','REVIEW')),
  reason_code text not null,
  risk_score numeric(5,2) not null,
  claims jsonb not null,
  provenance jsonb not null,
  missing_claims jsonb not null,
  failed_critical_claims jsonb not null,
  raw_fields_disclosed integer not null default 0,
  receipt_hash text not null,
  decision_latency_ms numeric(12,2) not null,
  request jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists privaterisk_v07_decisions_event_idx
  on public.privaterisk_v07_decisions(event_id);
create index if not exists privaterisk_v07_decisions_evaluated_idx
  on public.privaterisk_v07_decisions(evaluated_at desc);

create table if not exists public.privaterisk_v07_operations (
  id bigint generated always as identity primary key,
  operation_type text not null check (operation_type in ('IDEMPOTENT_REPLAY','EXPLICIT_REPLAY')),
  decision_id text not null references public.privaterisk_v07_decisions(decision_id) on delete cascade,
  matches_original boolean,
  created_at timestamptz not null default now()
);

create index if not exists privaterisk_v07_operations_decision_idx
  on public.privaterisk_v07_operations(decision_id, created_at desc);

create table if not exists public.privaterisk_v07_audit (
  audit_index bigint primary key,
  previous_hash text not null,
  received_at timestamptz not null,
  idempotency_key text not null unique,
  record jsonb not null,
  hash text not null unique
);

create or replace function public.privaterisk_v07_append_audit(
  p_idempotency_key text,
  p_record jsonb
)
returns table(
  audit_index bigint,
  previous_hash text,
  received_at timestamptz,
  idempotency_key text,
  record jsonb,
  hash text,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.privaterisk_v07_audit%rowtype;
  next_index bigint;
  prev_hash text;
  ts timestamptz;
  core jsonb;
  next_hash text;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency key required';
  end if;
  if p_record is null or not (p_record ? 'eventId') or not (p_record ? 'auditId') then
    raise exception 'audit record requires eventId and auditId';
  end if;

  perform pg_advisory_xact_lock(hashtext('privaterisk_v07_audit'));

  select * into existing
  from public.privaterisk_v07_audit
  where privaterisk_v07_audit.idempotency_key = p_idempotency_key;

  if found then
    return query select
      existing.audit_index,
      existing.previous_hash,
      existing.received_at,
      existing.idempotency_key,
      existing.record,
      existing.hash,
      true;
    return;
  end if;

  select
    coalesce(max(audit_index) + 1, 0),
    coalesce((select a.hash from public.privaterisk_v07_audit a order by a.audit_index desc limit 1), 'GENESIS')
  into next_index, prev_hash
  from public.privaterisk_v07_audit;

  ts := clock_timestamp();
  core := jsonb_build_object(
    'index', next_index,
    'previousHash', prev_hash,
    'receivedAt', to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'idempotencyKey', p_idempotency_key,
    'record', p_record
  );
  next_hash := encode(digest(convert_to(core::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.privaterisk_v07_audit(
    audit_index, previous_hash, received_at, idempotency_key, record, hash
  ) values (
    next_index, prev_hash, ts, p_idempotency_key, p_record, next_hash
  ) returning * into existing;

  return query select
    existing.audit_index,
    existing.previous_hash,
    existing.received_at,
    existing.idempotency_key,
    existing.record,
    existing.hash,
    false;
end;
$$;

create or replace function public.privaterisk_v07_verify_audit()
returns table(valid boolean, count bigint, head_hash text, broken_at bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.privaterisk_v07_audit%rowtype;
  expected_prev text := 'GENESIS';
  expected_index bigint := 0;
  core jsonb;
  expected_hash text;
  total bigint;
  head text;
begin
  select
    count(*),
    (select a.hash from public.privaterisk_v07_audit a order by a.audit_index desc limit 1)
  into total, head
  from public.privaterisk_v07_audit;

  for r in select * from public.privaterisk_v07_audit order by audit_index asc loop
    core := jsonb_build_object(
      'index', r.audit_index,
      'previousHash', r.previous_hash,
      'receivedAt', to_char(r.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'idempotencyKey', r.idempotency_key,
      'record', r.record
    );
    expected_hash := encode(digest(convert_to(core::text, 'UTF8'), 'sha256'), 'hex');

    if r.audit_index <> expected_index
      or r.previous_hash <> expected_prev
      or r.hash <> expected_hash then
      return query select false, total, head, expected_index;
      return;
    end if;

    expected_prev := r.hash;
    expected_index := expected_index + 1;
  end loop;

  return query select true, total, head, null::bigint;
end;
$$;

revoke all on public.privaterisk_v07_decisions from anon, authenticated;
revoke all on public.privaterisk_v07_operations from anon, authenticated;
revoke all on public.privaterisk_v07_audit from anon, authenticated;
revoke all on function public.privaterisk_v07_append_audit(text,jsonb) from public, anon, authenticated;
revoke all on function public.privaterisk_v07_verify_audit() from public, anon, authenticated;
grant execute on function public.privaterisk_v07_append_audit(text,jsonb) to service_role;
grant execute on function public.privaterisk_v07_verify_audit() to service_role;
