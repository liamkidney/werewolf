-- Resolve the night only when all living players have voted and the wolves agree.
-- Both vote RPCs lock the game row, making the final transition atomic.
create or replace function public.resolve_night_if_ready(p_game_id uuid, p_round integer)
returns uuid language plpgsql security definer set search_path to ''
as $$
declare v_wolves integer; v_villagers integer; v_wolf_votes integer; v_decoy_votes integer; v_distinct integer; v_victim uuid; v_host uuid;
begin
 select host_player_id into v_host from public.games
 where id=p_game_id and status='playing' and phase='night' and round_number=p_round;
 if not found then return null; end if;

 select count(*) filter(where r.role='werewolf'),count(*) filter(where r.role='villager')
 into v_wolves,v_villagers
 from public.players p join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
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

 if v_wolf_votes<>v_wolves or v_distinct<>1 or v_decoy_votes<>v_villagers then return null; end if;

 select nv.target_id into v_victim from public.night_votes nv
 where nv.game_id=p_game_id and nv.round_number=p_round limit 1;

 update public.players set eliminated_at=now()
 where id=v_victim and game_id=p_game_id and eliminated_at is null;

 update public.games set phase='dawn',last_murdered_id=v_victim,last_murdered_round=p_round,
 host_player_id=case when v_host=v_victim then
 (select id from public.players where game_id=p_game_id and eliminated_at is null order by random() limit 1)
 else v_host end,
 winner=(select case when count(*) filter(where r.role='werewolf')=0 then 'village'
 when count(*) filter(where r.role='werewolf')>=count(*) filter(where r.role='villager') then 'werewolves'
 else null end
 from public.players p join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
 where p.game_id=p_game_id and p.eliminated_at is null)
 where id=p_game_id;

 update public.games set status='finished' where id=p_game_id and winner is not null;
 return v_victim;
end $$;

create or replace function public.cast_night_vote(p_game_id uuid,p_round integer,p_voter uuid,p_target uuid)
returns uuid language plpgsql security definer set search_path to ''
as $$
declare g public.games%rowtype;
begin
 select * into g from public.games where id=p_game_id for update;
 if not found or g.status<>'playing' or g.phase<>'night' or g.round_number<>p_round then
  raise exception 'Night voting is no longer active';
 end if;
 if not exists(select 1 from public.players p join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
  where p.game_id=p_game_id and p.id=p_voter and p.eliminated_at is null and r.role='werewolf') then
  raise exception 'Only active werewolves may vote';
 end if;
 if not exists(select 1 from public.players p join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
  where p.game_id=p_game_id and p.id=p_target and p.eliminated_at is null and r.role='villager') then
  raise exception 'Target must be an active villager';
 end if;
 insert into public.night_votes(game_id,round_number,voter_id,target_id)
 values(p_game_id,p_round,p_voter,p_target)
 on conflict(game_id,round_number,voter_id) do update set target_id=excluded.target_id,updated_at=now();
 return public.resolve_night_if_ready(p_game_id,p_round);
end $$;

create or replace function public.cast_decoy_vote(p_game_id uuid,p_round integer,p_voter uuid,p_target uuid)
returns void language plpgsql security definer set search_path to ''
as $$
declare g public.games%rowtype;
begin
 select * into g from public.games where id=p_game_id for update;
 if not found or g.status<>'playing' or g.phase<>'night' or g.round_number<>p_round then
  raise exception 'Night voting is closed';
 end if;
 if not exists(select 1 from public.players p join public.player_roles r on r.game_id=p.game_id and r.player_id=p.id
  where p.game_id=p_game_id and p.id=p_voter and p.eliminated_at is null and r.role='villager') then
  raise exception 'Only surviving villagers can answer';
 end if;
 if p_target=p_voter or not exists(select 1 from public.players where id=p_target and game_id=p_game_id and eliminated_at is null) then
  raise exception 'Choose another surviving player';
 end if;
 insert into public.decoy_votes(game_id,round_number,voter_id,target_id)
 values(p_game_id,p_round,p_voter,p_target)
 on conflict(game_id,round_number,voter_id) do update set target_id=excluded.target_id;
 perform public.resolve_night_if_ready(p_game_id,p_round);
end $$;