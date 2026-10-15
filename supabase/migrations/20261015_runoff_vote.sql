-- Runoff voting is opt-in per game so existing production clients are unaffected.
alter table public.games add column if not exists runoff_enabled boolean not null default false;
alter table public.games add column if not exists vote_stage text not null default 'initial'
  check (vote_stage in ('initial','runoff'));
alter table public.games add column if not exists runoff_candidates uuid[] not null default '{}'::uuid[];

create table if not exists public.day_runoff_votes (
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null check (round_number>=1),
  voter_id uuid not null references public.players(id) on delete cascade,
  target_id uuid not null references public.players(id) on delete cascade,
  primary key (game_id,round_number,voter_id)
);
alter table public.day_runoff_votes enable row level security;
create policy "Runoff voting visibility" on public.day_runoff_votes
  for select to anon, authenticated using (true);
grant select on public.day_runoff_votes to anon, authenticated;

-- Reset round-local runoff state as we enter a new day.
CREATE OR REPLACE FUNCTION public.set_game_phase_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.phase is distinct from old.phase then
  new.phase_started_at := now();
  new.step := case new.phase when 'reveal' then 'roles' when 'day' then 'discussion'
   when 'results' then 'announcement' when 'night' then 'actions'
   when 'dawn' then 'murder_reveal' else 'waiting' end;
  if new.phase='day' then
    new.discussion_ended_at:=null;
    new.vote_stage:='initial';
    new.runoff_candidates:='{}'::uuid[];
  end if;
 elsif new.phase='day' and new.discussion_ended_at is not null
  and old.discussion_ended_at is distinct from new.discussion_ended_at then
  new.step:='voting';
 end if;
 return new;
end $function$


-- Reject stale original-ballot submissions after runoff has started.
CREATE OR REPLACE FUNCTION public.cast_day_vote(p_game_id uuid, p_round integer, p_voter uuid, p_target uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.games%rowtype;
begin
 select * into v_game from public.games where id=p_game_id for update;
 if v_game.status<>'playing' or v_game.phase<>'day' or v_game.round_number<>p_round
 or v_game.phase_started_at is null or (v_game.discussion_ended_at is null and now()<v_game.phase_started_at+make_interval(secs => v_game.day_duration_seconds))
 then raise exception 'Voting is not open'; end if;
 if v_game.runoff_enabled and v_game.vote_stage<>'initial' then raise exception 'Initial voting has ended'; end if;
 if p_voter=p_target then raise exception 'You cannot vote for yourself'; end if;
 if not exists(select 1 from public.players where id=p_voter and game_id=p_game_id and eliminated_at is null)
 or not exists(select 1 from public.players where id=p_target and game_id=p_game_id and eliminated_at is null)
 then raise exception 'Only active players may vote for active players'; end if;
 insert into public.day_votes(game_id,round_number,voter_id,target_id) values(p_game_id,p_round,p_voter,p_target);
end;
$function$


-- Resolve ties deterministically from counted ballots, never by random
-- selection for games with runoff enabled. A repeated tie eliminates no one.
CREATE OR REPLACE FUNCTION public.finish_day_vote(p_game_id uuid, p_round integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game public.games%rowtype; v_active integer; v_votes integer;
        v_winner uuid; v_next_host uuid;
        v_candidates uuid[]; v_vote_stage text;
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
  v_vote_stage := case when v_game.runoff_enabled then v_game.vote_stage else 'initial' end;
  if v_vote_stage = 'runoff' then
    select count(*) into v_votes from public.day_runoff_votes
    where game_id=p_game_id and round_number=p_round;
  else
    select count(*) into v_votes from public.day_votes
    where game_id=p_game_id and round_number=p_round;
  end if;
  if v_votes<>v_active then raise exception 'Waiting for all votes'; end if;
  if v_vote_stage = 'runoff' then
    with totals as (
      select target_id, count(*) as votes
      from public.day_runoff_votes
      where game_id=p_game_id and round_number=p_round
      group by target_id
    )
    select array_agg(target_id order by target_id)
    into v_candidates
    from totals where votes = (select max(votes) from totals);

    -- Only one runoff is permitted. Another tie means no banishment.
    v_winner := case when cardinality(v_candidates)=1 then v_candidates[1] else null end;
  else
    with totals as (
      select target_id, count(*) as votes
      from public.day_votes
      where game_id=p_game_id and round_number=p_round
      group by target_id
    )
    select array_agg(target_id order by target_id)
    into v_candidates
    from totals where votes = (select max(votes) from totals);

    if v_game.runoff_enabled and cardinality(v_candidates)>1 then
      update public.games set vote_stage='runoff', runoff_candidates=v_candidates
      where id=p_game_id and status='playing' and phase='day';
      return null;
    end if;
    -- Legacy games remain compatible with the existing random-tiebreak rules.
    v_winner := v_candidates[1 + floor(random()*cardinality(v_candidates))::integer];
  end if;
  if v_winner is not null then
    update public.players set eliminated_at=now(), elimination_reason='banished'
    where id=v_winner and game_id=p_game_id and eliminated_at is null;
  end if;
  if v_game.host_player_id=v_winner then
    select id into v_next_host from public.players
    where game_id=p_game_id and eliminated_at is null order by random() limit 1;
  else v_next_host:=v_game.host_player_id; end if;
  update public.games set
    phase='results',last_banished_id=v_winner,
    last_banished_round=case when v_winner is null then null else p_round end,
    runoff_candidates='{}'::uuid[],
    last_banished_role=(case when v_winner is not null and v_game.reveal_banished_role then
      (select r.role from public.player_roles r where r.game_id=p_game_id and r.player_id=v_winner)
      else null end),
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
$function$


-- Atomic runoff ballot acceptance and immediate result on the last vote.
create or replace function public.cast_runoff_vote(
  p_game_id uuid, p_round integer, p_voter uuid, p_target uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g public.games%rowtype;
  n_active integer;
  n_votes integer;
begin
  -- Serialize competing final votes and completion against the game row.
  select * into g from public.games where id=p_game_id for update;
  if not found or not g.runoff_enabled or g.status<>'playing'
     or g.phase<>'day' or g.step<>'voting'
     or g.vote_stage<>'runoff' or g.round_number<>p_round then
    raise exception 'The runoff is not active';
  end if;
  if p_voter=p_target then raise exception 'You cannot vote for yourself'; end if;
  if not (p_target = any(g.runoff_candidates)) then
    raise exception 'Only tied candidates can receive runoff votes';
  end if;
  if not exists(
      select 1 from public.players
      where id=p_voter and game_id=p_game_id and eliminated_at is null
    ) or not exists(
      select 1 from public.players
      where id=p_target and game_id=p_game_id and eliminated_at is null
    ) then
    raise exception 'Only active players may vote for active candidates';
  end if;
  insert into public.day_runoff_votes(game_id,round_number,voter_id,target_id)
  values(p_game_id,p_round,p_voter,p_target);

  select count(*) into n_active from public.players
  where game_id=p_game_id and eliminated_at is null;
  select count(*) into n_votes from public.day_runoff_votes
  where game_id=p_game_id and round_number=p_round;
  if n_votes=n_active then
    perform public.finish_day_vote(p_game_id,p_round);
  end if;
end;
$$;
revoke all on function public.cast_runoff_vote(uuid,integer,uuid,uuid) from public;
grant execute on function public.cast_runoff_vote(uuid,integer,uuid,uuid)
to anon, authenticated;
