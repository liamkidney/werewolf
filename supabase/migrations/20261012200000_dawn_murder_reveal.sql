alter table public.games add column if not exists last_murdered_id uuid references public.players(id);
alter table public.games add column if not exists last_murdered_round integer;
alter table public.games drop constraint if exists games_step_valid;
alter table public.games add constraint games_step_valid check (step in ('waiting','roles','discussion','voting','announcement','actions','murder_reveal'));
create or replace function public.set_game_phase_timestamp()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.phase is distinct from old.phase then
  new.phase_started_at := now();
  new.step := case new.phase when 'reveal' then 'roles' when 'day' then 'discussion'
   when 'results' then 'announcement' when 'night' then 'actions'
   when 'dawn' then 'murder_reveal' else 'waiting' end;
  if new.phase='day' then new.discussion_ended_at:=null; end if;
 elsif new.phase='day' and new.discussion_ended_at is not null
  and old.discussion_ended_at is distinct from new.discussion_ended_at then
  new.step:='voting';
 end if;
 return new;
end $$;
do $$
declare fn text;
begin
 select pg_get_functiondef('public.cast_night_vote(uuid,integer,uuid,uuid)'::regprocedure) into fn;
 if position('count(distinct target_id) into v_votes,v_distinct,v_victim' in fn)=0 then
  raise exception 'Unexpected cast_night_vote function';
 end if;
 fn:=replace(fn,'count(distinct target_id) into v_votes,v_distinct,v_victim','count(distinct target_id) into v_votes,v_distinct');
 fn:=replace(fn,'update public.games set phase=''day'',phase_started_at=now(),discussion_ended_at=null where id=p_game_id;',
 'update public.games set phase=''dawn'',last_murdered_id=v_victim,last_murdered_round=p_round where id=p_game_id;');
 execute fn;
end $$;
create or replace function public.advance_game_phase(p_game_id uuid, p_host uuid, p_phase text, p_round integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_game public.games%rowtype;
begin
 select * into v_game from public.games where id=p_game_id for update;
 if not found or v_game.status <> 'playing' or v_game.host_player_id is distinct from p_host
  or v_game.phase is distinct from p_phase or v_game.round_number <> p_round
 then raise exception 'Not host or game state has changed'; end if;
 if p_phase='reveal' or p_phase='dawn' then
  update public.games set phase='day' where id=p_game_id;
 elsif p_phase='results' then
  update public.games set phase='night',round_number=p_round+1 where id=p_game_id;
 else raise exception 'Manual transition not permitted from %',p_phase;
 end if;
end $$;