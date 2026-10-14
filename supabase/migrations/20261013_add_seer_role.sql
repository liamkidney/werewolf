-- Add the Seer as a configurable village role, without changing existing games.
-- The database default stays 0 for compatibility with the production frontend.
-- New dev games explicitly insert seer_count = 1.
alter table public.games add column if not exists seer_count integer not null default 0;
alter table public.games add constraint games_seer_count_range check (seer_count between 0 and 50);

alter table public.player_roles drop constraint if exists player_roles_role_check;
alter table public.player_roles
  add constraint player_roles_role_check check (role in ('werewolf','villager','seer'));

create table if not exists public.seer_investigations (
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  seer_id uuid not null references public.players(id),
  target_id uuid not null references public.players(id),
  is_werewolf boolean not null,
  created_at timestamptz not null default now(),
  primary key (game_id, round_number, seer_id),
  check (seer_id <> target_id)
);
create index if not exists seer_investigations_seer_history
  on public.seer_investigations (game_id, seer_id, round_number desc);
alter table public.seer_investigations enable row level security;
-- Do not expose investigation targets or results through table reads.
revoke all on public.seer_investigations from public, anon, authenticated;

create or replace function public.set_lobby_seer_count(
  p_game_id uuid, p_host uuid, p_count integer
) returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_count is null or p_count < 0 or p_count > 50 then
    raise exception 'Invalid seer count';
  end if;
  update public.games set seer_count = p_count
  where id = p_game_id and status = 'lobby' and host_player_id = p_host;
  if not found then raise exception 'Only the host can configure Seers in the lobby'; end if;
end;
$$;

create or replace function public.start_werewolf_game(p_game_id uuid, p_assignments jsonb)
returns void language plpgsql set search_path = ''
as $$
declare v_wolves integer; v_seers integer; v_player_count integer; v_status text;
begin
  select status, werewolf_count, seer_count into v_status, v_wolves, v_seers
  from public.games where id=p_game_id for update;
  if v_status is distinct from 'lobby' then
    raise exception 'Game is unavailable or already started';
  end if;
  select count(*) into v_player_count from public.players where game_id=p_game_id;
  if v_player_count < 3 or v_wolves < 1 or v_wolves > 50
     or v_seers < 0 or v_seers > 50
     or v_wolves + v_seers >= v_player_count then
    raise exception 'Invalid player, werewolf or seer count';
  end if;
  if jsonb_typeof(p_assignments) is distinct from 'array'
     or jsonb_array_length(p_assignments) <> v_player_count then
    raise exception 'Assignments must include every player';
  end if;
  if exists (
       select 1 from jsonb_to_recordset(p_assignments) as a(player_id uuid,role text)
       where a.role not in ('werewolf','villager','seer')
         or a.role is null or a.player_id is null
     )
     or (select count(distinct a.player_id)
         from jsonb_to_recordset(p_assignments) as a(player_id uuid,role text)) <> v_player_count
     or (select count(*) from jsonb_to_recordset(p_assignments) as a(player_id uuid,role text)
         where a.role='werewolf') <> v_wolves
     or (select count(*) from jsonb_to_recordset(p_assignments) as a(player_id uuid,role text)
         where a.role='seer') <> v_seers
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
      and r.role in ('villager','seer')) then
    raise exception 'Target must be an active village player';
  end if;
  insert into public.night_votes(game_id,round_number,voter_id,target_id)
  values(p_game_id,p_round,p_voter,p_target)
  on conflict(game_id,round_number,voter_id)
  do update set target_id=excluded.target_id,updated_at=now();
  return public.resolve_night_if_ready(p_game_id,p_round);
end;
$$;

create or replace function public.resolve_night_if_ready(p_game_id uuid, p_round integer)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_wolves integer; v_villagers integer; v_seers integer;
  v_wolf_votes integer; v_decoy_votes integer; v_seer_votes integer;
  v_distinct integer; v_victim uuid; v_host uuid;
begin
  select host_player_id into v_host from public.games
  where id=p_game_id and status='playing' and phase='night' and round_number=p_round;
  if not found then return null; end if;

  select count(*) filter(where r.role='werewolf'),
         count(*) filter(where r.role='villager'),
         count(*) filter(where r.role='seer')
  into v_wolves,v_villagers,v_seers
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

  if v_wolf_votes<>v_wolves or v_distinct<>1
     or v_decoy_votes<>v_villagers or v_seer_votes<>v_seers then
    return null;
  end if;

  select nv.target_id into v_victim from public.night_votes nv
  where nv.game_id=p_game_id and nv.round_number=p_round limit 1;

  update public.players set eliminated_at=now()
  where id=v_victim and game_id=p_game_id and eliminated_at is null;

  update public.games set
    phase='dawn',
    round_number=p_round+1,
    last_murdered_id=v_victim,
    last_murdered_round=p_round+1,
    host_player_id=case when v_host=v_victim then
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
  return v_victim;
end;
$$;

create or replace function public.cast_seer_investigation(
  p_game_id uuid, p_round integer, p_seer uuid, p_target uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  g public.games%rowtype; v_is_werewolf boolean; v_existing uuid; v_target_name text;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found or g.status<>'playing' or g.phase<>'night' or g.round_number<>p_round then
    raise exception 'Seer investigations are closed';
  end if;
  if not exists (
    select 1 from public.players p
    join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
    where p.game_id=p_game_id and p.id=p_seer and p.eliminated_at is null
      and r.role='seer'
  ) then
    raise exception 'Only a surviving Seer can investigate';
  end if;
  if p_target=p_seer or not exists (
    select 1 from public.players p
    where p.game_id=p_game_id and p.id=p_target and p.eliminated_at is null
  ) then
    raise exception 'Choose another surviving player';
  end if;
  select i.target_id into v_existing from public.seer_investigations i
  where i.game_id=p_game_id and i.round_number=p_round and i.seer_id=p_seer;
  if v_existing is not null and v_existing<>p_target then
    raise exception 'Your investigation is already locked';
  end if;
  select r.role='werewolf',p.name into v_is_werewolf,v_target_name
  from public.players p
  join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
  where p.id=p_target and p.game_id=p_game_id;
  if v_is_werewolf is null then raise exception 'Target role could not be found'; end if;
  insert into public.seer_investigations
    (game_id,round_number,seer_id,target_id,is_werewolf)
  values(p_game_id,p_round,p_seer,p_target,v_is_werewolf)
  on conflict (game_id,round_number,seer_id) do nothing;
  perform public.resolve_night_if_ready(p_game_id,p_round);
  return jsonb_build_object(
    'roundNumber',p_round,'targetId',p_target,
    'targetName',v_target_name,'isWerewolf',v_is_werewolf
  );
end;
$$;

create or replace function public.get_seer_pack(
  p_game_id uuid, p_seer uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare g public.games%rowtype; v_history jsonb; v_current jsonb;
begin
  select * into g from public.games where id=p_game_id;
  if not found then raise exception 'Game not found'; end if;
  if not exists (
    select 1 from public.player_roles r
    where r.game_id=p_game_id and r.player_id=p_seer and r.role='seer'
  ) then raise exception 'Only a Seer may read investigations'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'roundNumber',i.round_number,'targetId',i.target_id,
    'targetName',p.name,'isWerewolf',i.is_werewolf
  ) order by i.round_number desc),'[]'::jsonb)
  into v_history
  from public.seer_investigations i
  join public.players p on p.id=i.target_id and p.game_id=i.game_id
  where i.game_id=p_game_id and i.seer_id=p_seer;
  select jsonb_build_object(
    'roundNumber',i.round_number,'targetId',i.target_id,
    'targetName',p.name,'isWerewolf',i.is_werewolf
  ) into v_current
  from public.seer_investigations i
  join public.players p on p.id=i.target_id and p.game_id=i.game_id
  where i.game_id=p_game_id and i.seer_id=p_seer and i.round_number=g.round_number;
  return jsonb_build_object('myInvestigation',v_current,'history',v_history);
end;
$$;

create or replace function public.finish_day_vote(p_game_id uuid, p_round integer)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_game public.games%rowtype; v_active integer; v_votes integer;
        v_winner uuid; v_next_host uuid;
begin
  select * into v_game from public.games where id=p_game_id for update;
  if v_game.status <> 'playing' or v_game.phase <> 'day'
     or v_game.round_number <> p_round then
    raise exception 'Voting is no longer active';
  end if;
  if v_game.phase_started_at is null
    or (v_game.discussion_ended_at is null
        and v_game.phase_started_at + make_interval(secs => v_game.day_duration_seconds)>now()) then
    raise exception 'Discussion timer has not finished';
  end if;
  select count(*) into v_active from public.players
  where game_id=p_game_id and eliminated_at is null;
  select count(*) into v_votes from public.day_votes
  where game_id=p_game_id and round_number=p_round;
  if v_votes<>v_active then raise exception 'Waiting for all votes'; end if;
  select target_id into v_winner from public.day_votes
  where game_id=p_game_id and round_number=p_round
  group by target_id order by count(*) desc,random() limit 1;
  update public.players set eliminated_at=now()
  where id=v_winner and game_id=p_game_id and eliminated_at is null;
  if v_game.host_player_id=v_winner then
    select id into v_next_host from public.players
    where game_id=p_game_id and eliminated_at is null order by random() limit 1;
  else v_next_host:=v_game.host_player_id; end if;
  update public.games set
    phase='results',last_banished_id=v_winner,last_banished_round=p_round,
    host_player_id=v_next_host,
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
  return v_winner;
end;
$$;

revoke all on function public.cast_seer_investigation(uuid,integer,uuid,uuid) from public;
revoke all on function public.get_seer_pack(uuid,uuid) from public;
revoke all on function public.set_lobby_seer_count(uuid,uuid,integer) from public;
grant execute on function public.cast_seer_investigation(uuid,integer,uuid,uuid) to anon, authenticated;
grant execute on function public.get_seer_pack(uuid,uuid) to anon, authenticated;
grant execute on function public.set_lobby_seer_count(uuid,uuid,integer) to anon, authenticated;
