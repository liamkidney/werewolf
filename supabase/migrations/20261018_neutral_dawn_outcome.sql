-- Public dawn results must not reveal whether a Bodyguard acted.
-- Keep only a neutral no-murder outcome in the games table.
alter table public.games drop constraint if exists games_last_night_outcome_valid;
update public.games set last_night_outcome='no_murder' where last_night_outcome='protected';
alter table public.games add constraint games_last_night_outcome_valid
  check (last_night_outcome is null or last_night_outcome in ('murdered','no_murder'));

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
    last_night_outcome=case when v_protected then 'no_murder' else 'murdered' end,
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
