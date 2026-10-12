-- Villager decoy voting and atomic endgame decisions.
-- Applied to the shared Supabase project; maintained here for reproducibility.
alter table public.games add column if not exists decoy_question text;
alter table public.games add column if not exists winner text check (winner in ('village','werewolves'));
create table if not exists public.decoy_votes (
 game_id uuid not null references public.games(id) on delete cascade,
 round_number integer not null,
 voter_id uuid not null references public.players(id),
 target_id uuid not null references public.players(id),
 primary key(game_id,round_number,voter_id)
);
alter table public.decoy_votes enable row level security;
CREATE OR REPLACE FUNCTION public.advance_game_phase(p_game_id uuid, p_host uuid, p_phase text, p_round integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.games%rowtype;
begin
 select * into g from public.games where id=p_game_id for update;
 if not found or g.status<>'playing' or g.host_player_id is distinct from p_host
  or g.phase is distinct from p_phase or g.round_number<>p_round then
  raise exception 'Not host or game state has changed';
 end if;
 if p_phase='reveal' or p_phase='dawn' then
  if p_phase='dawn' and (g.phase_started_at is null or g.phase_started_at+interval '6 seconds'>clock_timestamp()) then
   raise exception 'Wait for the suspense to finish';
  end if;
  update public.games set phase='day' where id=p_game_id;
 elsif p_phase='results' then
  update public.games set phase='night',round_number=p_round+1,
  decoy_question=(array['Who is least trustworthy?','Who might betray you?','Who is hiding the biggest secret?','Who would abandon the group first?','Who is the most suspicious?','Who would make the best double agent?','Who is most likely to be bluffing?','Who would you least trust with a secret?'])[1+floor(random()*8)::integer]
  where id=p_game_id;
 else raise exception 'Manual transition not permitted from %',p_phase;
 end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.cast_decoy_vote(p_game_id uuid, p_round integer, p_voter uuid, p_target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.cast_night_vote(p_game_id uuid, p_round integer, p_voter uuid, p_target uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.games%rowtype; v_wolves integer; v_votes integer; v_distinct integer; v_victim uuid;
begin
 select * into v_game from public.games where id=p_game_id for update;
 if not found or v_game.status<>'playing' or v_game.phase<>'night' or v_game.round_number<>p_round
 then raise exception 'Night voting is no longer active'; end if;
 if not exists (select 1 from public.players p join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
    where p.game_id=p_game_id and p.id=p_voter and p.eliminated_at is null and r.role='werewolf')
 then raise exception 'Only active werewolves may vote'; end if;
 if not exists (select 1 from public.players p join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
    where p.game_id=p_game_id and p.id=p_target and p.eliminated_at is null and r.role='villager')
 then raise exception 'Target must be an active villager'; end if;
 insert into public.night_votes(game_id,round_number,voter_id,target_id)
 values(p_game_id,p_round,p_voter,p_target)
 on conflict(game_id,round_number,voter_id) do update set target_id=excluded.target_id,updated_at=now();
 select count(*) into v_wolves from public.players p join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
 where p.game_id=p_game_id and p.eliminated_at is null and r.role='werewolf';
 select count(*),count(distinct target_id) into v_votes,v_distinct
 from public.night_votes where game_id=p_game_id and round_number=p_round;
 if v_votes=v_wolves and v_distinct=1 then
   select target_id into v_victim from public.night_votes where game_id=p_game_id and round_number=p_round limit 1;
   update public.players set eliminated_at=now() where id=v_victim and game_id=p_game_id and eliminated_at is null;
   update public.games set phase='dawn',last_murdered_id=v_victim,last_murdered_round=p_round,
 host_player_id=case when v_game.host_player_id=v_victim then
 (select id from public.players where game_id=p_game_id and eliminated_at is null order by random() limit 1)
 else v_game.host_player_id end, winner=(select case when count(*) filter(where r.role='werewolf')=0 then 'village' when count(*) filter(where r.role='werewolf')>=count(*) filter(where r.role='villager') then 'werewolves' else null end from public.players p join public.player_roles r on r.game_id=p.game_id and r.player_id=p.id where p.game_id=p_game_id and p.eliminated_at is null) where id=p_game_id;
 update public.games set status='finished' where id=p_game_id and winner is not null;
   return v_victim;
 end if;
 return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.finish_day_vote(p_game_id uuid, p_round integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.games%rowtype; v_active integer; v_votes integer; v_winner uuid; v_next_host uuid;
begin
 select * into v_game from public.games where id=p_game_id for update;
 if v_game.status <> 'playing' or v_game.phase <> 'day' or v_game.round_number <> p_round then raise exception 'Voting is no longer active'; end if;
 if v_game.phase_started_at is null or (v_game.discussion_ended_at is null and v_game.phase_started_at+make_interval(secs => v_game.day_duration_seconds)>now()) then raise exception 'Discussion timer has not finished'; end if;
 select count(*) into v_active from public.players where game_id=p_game_id and eliminated_at is null;
 select count(*) into v_votes from public.day_votes where game_id=p_game_id and round_number=p_round;
 if v_votes<>v_active then raise exception 'Waiting for all votes'; end if;
 select target_id into v_winner from public.day_votes where game_id=p_game_id and round_number=p_round
 group by target_id order by count(*) desc,random() limit 1;
 update public.players set eliminated_at=now() where id=v_winner and game_id=p_game_id and eliminated_at is null;
 if v_game.host_player_id=v_winner then
 select id into v_next_host from public.players where game_id=p_game_id and eliminated_at is null order by random() limit 1;
 else v_next_host:=v_game.host_player_id; end if;
 update public.games set phase='results',last_banished_id=v_winner,last_banished_round=p_round,
 host_player_id=v_next_host, winner=(select case when count(*) filter(where r.role='werewolf')=0 then 'village' when count(*) filter(where r.role='werewolf')>=count(*) filter(where r.role='villager') then 'werewolves' else null end from public.players p join public.player_roles r on r.game_id=p.game_id and r.player_id=p.id where p.game_id=p_game_id and p.eliminated_at is null) where id=p_game_id;
 update public.games set status='finished' where id=p_game_id and winner is not null;
 return v_winner;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_decoy_pack(p_game_id uuid, p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.games%rowtype; v_target uuid; v_results jsonb;
begin
 select * into g from public.games where id=p_game_id;
 if not found then raise exception 'Game not found'; end if;
 if not exists(select 1 from public.players where id=p_player_id and game_id=p_game_id) then
  raise exception 'Not a player in this game';
 end if;
 select target_id into v_target from public.decoy_votes
 where game_id=p_game_id and round_number=g.round_number and voter_id=p_player_id;
 if g.phase='dawn' or (g.status='finished' and g.phase='dawn') then
  select coalesce(jsonb_agg(jsonb_build_object('id',v.target_id,'votes',v.n)), '[]'::jsonb) into v_results
  from (select target_id,count(*) as n from public.decoy_votes
   where game_id=p_game_id and round_number=g.round_number group by target_id) v;
 end if;
 return jsonb_build_object('question',g.decoy_question,'myVote',v_target,'results',coalesce(v_results,'[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION public.get_final_roles(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.games%rowtype; v_roles jsonb;
begin
 select * into g from public.games where id=p_game_id;
 if not found or g.status<>'finished' then raise exception 'Game is not finished'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'role',r.role,'eliminated',p.eliminated_at is not null)
 order by p.joined_at),'[]'::jsonb) into v_roles
 from public.players p join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
 where p.game_id=p_game_id;
 return v_roles;
end $function$
;
update public.games set decoy_question='Who is least trustworthy?' where phase='night' and decoy_question is null;
