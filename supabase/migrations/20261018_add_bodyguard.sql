-- Bodyguard: simultaneous defensive night action. Defaults to zero so older
-- production clients/games retain their existing rules and night resolution.
alter table public.games add column if not exists bodyguard_count integer not null default 0;
alter table public.games add column if not exists last_night_outcome text;
alter table public.games add constraint games_bodyguard_count_range check (bodyguard_count between 0 and 50);
alter table public.games add constraint games_last_night_outcome_valid
  check (last_night_outcome is null or last_night_outcome in ('murdered','protected'));

alter table public.player_roles drop constraint if exists player_roles_role_check;
alter table public.player_roles
  add constraint player_roles_role_check check (role in ('werewolf','villager','seer','bodyguard'));

create table public.bodyguard_protections (
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  bodyguard_id uuid not null references public.players(id),
  target_id uuid not null references public.players(id),
  created_at timestamptz not null default now(),
  primary key (game_id,round_number,bodyguard_id)
);
create index bodyguard_protections_history_idx
  on public.bodyguard_protections (game_id,bodyguard_id,round_number desc);
alter table public.bodyguard_protections enable row level security;
revoke all on public.bodyguard_protections from public, anon, authenticated;

create or replace function public.set_lobby_bodyguard_count(
  p_game_id uuid, p_host uuid, p_count integer
) returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_count is null or p_count < 0 or p_count > 50 then
    raise exception 'Invalid Bodyguard count';
  end if;
  update public.games set bodyguard_count = p_count
  where id=p_game_id and status='lobby' and host_player_id=p_host;
  if not found then raise exception 'Only the host can configure Bodyguards in the lobby'; end if;
end;
$$;

-- Same atomic lobby start and strict complete assignment validation as before.
create or replace function public.start_werewolf_game(p_game_id uuid, p_assignments jsonb)
returns void language plpgsql set search_path = ''
as $$
declare
  v_wolves integer; v_seers integer; v_guards integer;
  v_player_count integer; v_status text;
begin
  select status, werewolf_count, seer_count, bodyguard_count
    into v_status, v_wolves, v_seers, v_guards
  from public.games where id=p_game_id for update;
  if v_status is distinct from 'lobby' then
    raise exception 'Game is unavailable or already started';
  end if;
  select count(*) into v_player_count from public.players where game_id=p_game_id;
  if v_player_count < 3 or v_wolves not between 1 and 50
     or v_seers not between 0 and 50 or v_guards not between 0 and 50
     or v_wolves + v_seers + v_guards >= v_player_count then
    raise exception 'Invalid player or special-role count';
  end if;
  if jsonb_typeof(p_assignments) is distinct from 'array'
     or jsonb_array_length(p_assignments) <> v_player_count then
    raise exception 'Assignments must include every player';
  end if;
  if exists (
       select 1 from jsonb_to_recordset(p_assignments) as a(player_id uuid,role text)
       where a.role not in ('werewolf','villager','seer','bodyguard')
         or a.role is null or a.player_id is null
     )
     or (select count(distinct a.player_id)
         from jsonb_to_recordset(p_assignments) as a(player_id uuid,role text)) <> v_player_count
     or (select count(*) from jsonb_to_recordset(p_assignments) as a(player_id uuid,role text)
         where a.role='werewolf') <> v_wolves
     or (select count(*) from jsonb_to_recordset(p_assignments) as a(player_id uuid,role text)
         where a.role='seer') <> v_seers
     or (select count(*) from jsonb_to_recordset(p_assignments) as a(player_id uuid,role text)
         where a.role='bodyguard') <> v_guards
     or exists (
       select 1 from jsonb_to_recordset(p_assignments) as a(player_id uuid,role text)
       where not exists (select 1 from public.players p
         where p.id=a.player_id and p.game_id=p_game_id)
     ) then
    raise exception 'Invalid role assignments';
  end if;
  insert into public.player_roles(player_id,game_id,role)
  select a.player_id,p_game_id,a.role
  from jsonb_to_recordset(p_assignments) as a(player_id uuid,role text);
  update public.games set status='playing',phase='reveal',phase_started_at=now()
  where id=p_game_id;
end;
$$;

-- Idempotent night resolution: every living player completes their own action.
-- This function is called from the game-row-locked action RPCs below/elsewhere.
create or replace function public.resolve_night_if_ready(p_game_id uuid, p_round integer)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_wolves integer; v_villagers integer; v_seers integer; v_guards integer;
  v_wolf_votes integer; v_decoy_votes integer; v_seer_votes integer; v_guard_votes integer;
  v_distinct integer; v_victim uuid; v_host uuid; v_protected boolean;
begin
  select host_player_id into v_host from public.games
  where id=p_game_id and status='playing' and phase='night' and round_number=p_round;
  if not found then return null; end if;

  select count(*) filter(where r.role='werewolf'),
         count(*) filter(where r.role='villager'),
         count(*) filter(where r.role='seer'),
         count(*) filter(where r.role='bodyguard')
    into v_wolves,v_villagers,v_seers,v_guards
  from public.players p
  join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
  where p.game_id=p_game_id and p.eliminated_at is null;

  select count(*),count(distinct nv.target_id) into v_wolf_votes,v_distinct
  from public.night_votes nv
  join public.players p on p.id=nv.voter_id and p.game_id=nv.game_id and p.eliminated_at is null
  join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id and r.role='werewolf'
  where nv.game_id=p_game_id and nv.round_number=p_round;

  select count(*) into v_decoy_votes
  from public.decoy_votes dv
  join public.players p on p.id=dv.voter_id and p.game_id=dv.game_id and p.eliminated_at is null
  join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id and r.role='villager'
  where dv.game_id=p_game_id and dv.round_number=p_round;

  select count(*) into v_seer_votes
  from public.seer_investigations i
  join public.players p on p.id=i.seer_id and p.game_id=i.game_id and p.eliminated_at is null
  join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id and r.role='seer'
  where i.game_id=p_game_id and i.round_number=p_round;

  select count(*) into v_guard_votes
  from public.bodyguard_protections bp
  join public.players p on p.id=bp.bodyguard_id and p.game_id=bp.game_id and p.eliminated_at is null
  join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id and r.role='bodyguard'
  where bp.game_id=p_game_id and bp.round_number=p_round;

  if v_wolf_votes<>v_wolves or v_distinct<>1
    or v_decoy_votes<>v_villagers or v_seer_votes<>v_seers
    or v_guard_votes<>v_guards then
    return null;
  end if;

  select nv.target_id into v_victim from public.night_votes nv
  where nv.game_id=p_game_id and nv.round_number=p_round limit 1;

  select exists (
    select 1 from public.bodyguard_protections bp
    where bp.game_id=p_game_id and bp.round_number=p_round and bp.target_id=v_victim
  ) into v_protected;

  if not v_protected then
    update public.players set eliminated_at=now(), elimination_reason='murdered'
    where id=v_victim and game_id=p_game_id and eliminated_at is null;
  end if;

  update public.games set
    phase='dawn',
    round_number=p_round+1,
    last_night_outcome=case when v_protected then 'protected' else 'murdered' end,
    last_murdered_id=case when v_protected then null else v_victim end,
    last_murdered_round=case when v_protected then null else p_round+1 end,
    host_player_id=case when not v_protected and v_host=v_victim then
      (select id from public.players where game_id=p_game_id
       and eliminated_at is null order by random() limit 1)
      else v_host end,
    winner=(
      select case
        when count(*) filter(where r.role='werewolf')=0 then 'village'
        when count(*) filter(where r.role='werewolf')
             >= count(*) filter(where r.role<>'werewolf') then 'werewolves'
        else null end
      from public.players p
      join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
      where p.game_id=p_game_id and p.eliminated_at is null
    )
  where id=p_game_id;
  update public.games set status='finished' where id=p_game_id and winner is not null;
  return case when v_protected then null else v_victim end;
end;
$$;

-- Wolves may target all living village-aligned roles, including Bodyguards.
create or replace function public.cast_night_vote(
  p_game_id uuid, p_round integer, p_voter uuid, p_target uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare g public.games%rowtype;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found or g.status<>'playing' or g.phase<>'night' or g.round_number<>p_round then
    raise exception 'Night voting is no longer active';
  end if;
  if not exists(select 1 from public.players p
    join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
    where p.game_id=p_game_id and p.id=p_voter and p.eliminated_at is null
      and r.role='werewolf') then
    raise exception 'Only active werewolves may vote';
  end if;
  if not exists(select 1 from public.players p
    join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
    where p.game_id=p_game_id and p.id=p_target and p.eliminated_at is null
      and r.role in ('villager','seer','bodyguard')) then
    raise exception 'Target must be an active village player';
  end if;
  insert into public.night_votes(game_id,round_number,voter_id,target_id)
  values(p_game_id,p_round,p_voter,p_target)
  on conflict(game_id,round_number,voter_id)
  do update set target_id=excluded.target_id,updated_at=now();
  return public.resolve_night_if_ready(p_game_id,p_round);
end;
$$;

create or replace function public.get_bodyguard_pack(
  p_game_id uuid, p_bodyguard uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare g public.games%rowtype; v_current uuid; v_previous uuid;
begin
  select * into g from public.games where id=p_game_id;
  if not found then raise exception 'Game not found'; end if;
  if not exists(
    select 1 from public.players p
    join public.player_roles r on r.game_id=p.game_id and r.player_id=p.id
    where p.id=p_bodyguard and p.game_id=p_game_id and r.role='bodyguard'
  ) then raise exception 'Only the Bodyguard may read protection history'; end if;
  select target_id into v_current from public.bodyguard_protections
  where game_id=p_game_id and bodyguard_id=p_bodyguard and round_number=g.round_number;
  select target_id into v_previous from public.bodyguard_protections
  where game_id=p_game_id and bodyguard_id=p_bodyguard and round_number=g.round_number-1;
  return jsonb_build_object('myProtection',v_current,'lastProtectionTargetId',v_previous);
end;
$$;

create or replace function public.cast_bodyguard_protection(
  p_game_id uuid, p_round integer, p_bodyguard uuid, p_target uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare g public.games%rowtype; v_previous uuid;
begin
  -- The game lock serializes all night actions and the final resolution.
  select * into g from public.games where id=p_game_id for update;
  if not found or g.status<>'playing' or g.phase<>'night' or g.round_number<>p_round then
    raise exception 'Protection is no longer active';
  end if;
  if not exists (
    select 1 from public.players p
    join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
    where p.game_id=p_game_id and p.id=p_bodyguard and p.eliminated_at is null
      and r.role='bodyguard'
  ) then raise exception 'Only a living Bodyguard can protect'; end if;
  if not exists (
    select 1 from public.players p where p.id=p_target and p.game_id=p_game_id
      and p.eliminated_at is null
  ) then raise exception 'Choose a living player'; end if;
  select target_id into v_previous from public.bodyguard_protections
    where game_id=p_game_id and bodyguard_id=p_bodyguard and round_number=p_round-1;
  if v_previous=p_target then
    raise exception 'You cannot protect the same person on consecutive nights';
  end if;
  insert into public.bodyguard_protections(game_id,round_number,bodyguard_id,target_id)
  values (p_game_id,p_round,p_bodyguard,p_target)
  on conflict(game_id,round_number,bodyguard_id) do update
    set target_id=excluded.target_id,created_at=now();
  return public.resolve_night_if_ready(p_game_id,p_round);
end;
$$;

revoke all on function public.set_lobby_bodyguard_count(uuid,uuid,integer) from public;
revoke all on function public.get_bodyguard_pack(uuid,uuid) from public;
revoke all on function public.cast_bodyguard_protection(uuid,integer,uuid,uuid) from public;
grant execute on function public.set_lobby_bodyguard_count(uuid,uuid,integer) to anon, authenticated;
grant execute on function public.get_bodyguard_pack(uuid,uuid) to anon, authenticated;
grant execute on function public.cast_bodyguard_protection(uuid,integer,uuid,uuid) to anon, authenticated;
