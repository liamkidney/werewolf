-- Recover a player's existing identity on another phone without touching roles,
-- votes, host assignment, or player membership.
alter table public.players
  add column if not exists session_generation integer not null default 0;

create table if not exists public.player_rejoin_tickets (
  token_hash text primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  target_id uuid not null references public.players(id) on delete cascade,
  issuer_id uuid not null references public.players(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists player_rejoin_tickets_game_target
  on public.player_rejoin_tickets(game_id, target_id);

-- The token itself is never stored. No clients may read or write the ticket table:
-- only the two deliberately exposed RPCs below can access it.
alter table public.player_rejoin_tickets enable row level security;
revoke all on table public.player_rejoin_tickets from public, anon, authenticated;

create or replace function public.issue_player_rejoin_ticket(
  p_game_id uuid, p_issuer_id uuid, p_target_id uuid
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_token text;
begin
  if not exists (
    select 1 from public.games
    where id = p_game_id and status = 'playing'
  ) then
    raise exception 'The game is not active';
  end if;
  if not exists (
    select 1 from public.players
    where id = p_issuer_id and game_id = p_game_id
  ) then
    raise exception 'Only a member of this game can help someone rejoin';
  end if;
  if not exists (
    select 1 from public.players
    where id = p_target_id and game_id = p_game_id
  ) then
    raise exception 'The selected player does not belong to this game';
  end if;

  -- Invalidate earlier, unused QR codes for this player.
  delete from public.player_rejoin_tickets
  where game_id = p_game_id and target_id = p_target_id and used_at is null;

  -- Two independently generated UUIDs provide high-entropy, unguessable
  -- one-time credentials, with only their SHA-256 digest stored server-side.
  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');
  insert into public.player_rejoin_tickets
    (token_hash, game_id, target_id, issuer_id, expires_at)
  values (
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    p_game_id, p_target_id, p_issuer_id, now() + interval '2 minutes'
  );
  return v_token;
end;
$$;

create or replace function public.redeem_player_rejoin_ticket(
  p_token text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ticket public.player_rejoin_tickets%rowtype;
  v_generation integer;
  v_name text;
begin
  if p_token is null or length(p_token) <> 64
     or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rejoin code';
  end if;

  -- FOR UPDATE serializes simultaneous scans: only one can claim this QR.
  select * into v_ticket
  from public.player_rejoin_tickets
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;

  if not found or v_ticket.used_at is not null or v_ticket.expires_at <= now() then
    raise exception 'Rejoin code expired or already used';
  end if;
  if not exists (
    select 1 from public.games where id = v_ticket.game_id and status = 'playing'
  ) then
    raise exception 'The game is no longer active';
  end if;

  update public.players
  set session_generation = session_generation + 1
  where id = v_ticket.target_id and game_id = v_ticket.game_id
  returning session_generation, name into v_generation, v_name;

  if not found then raise exception 'Player not found'; end if;

  update public.player_rejoin_tickets
  set used_at = now()
  where token_hash = v_ticket.token_hash;

  return jsonb_build_object(
    'game_id', v_ticket.game_id,
    'player_id', v_ticket.target_id,
    'session_generation', v_generation,
    'name', v_name
  );
end;
$$;

revoke all on function public.issue_player_rejoin_ticket(uuid, uuid, uuid) from public;
revoke all on function public.redeem_player_rejoin_ticket(text) from public;
grant execute on function public.issue_player_rejoin_ticket(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.redeem_player_rejoin_ticket(text) to anon, authenticated;
