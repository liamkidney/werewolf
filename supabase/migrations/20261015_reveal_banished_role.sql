-- Host-configurable role reveal for banishments (defaults off for existing games).
alter table public.games
  add column if not exists reveal_banished_role boolean not null default false;
alter table public.games
  add column if not exists last_banished_role text
    check (last_banished_role in ('villager', 'seer', 'werewolf'));

create or replace function public.set_lobby_reveal_banished_role(
  p_game_id uuid, p_host uuid, p_reveal boolean
) returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_reveal is null then raise exception 'Invalid reveal setting'; end if;
  update public.games set reveal_banished_role = p_reveal
  where id = p_game_id and status = 'lobby' and host_player_id = p_host;
  if not found then
    raise exception 'Only the host can configure role reveals in the lobby';
  end if;
end;
$$;

revoke all on function public.set_lobby_reveal_banished_role(uuid,uuid,boolean) from public;
grant execute on function public.set_lobby_reveal_banished_role(uuid,uuid,boolean)
  to anon, authenticated;

-- Store the banished role atomically, and only when the host enabled revealing.
-- Also record the elimination reason, used by the public game-history panel.

CREATE OR REPLACE FUNCTION public.finish_day_vote(p_game_id uuid, p_round integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  update public.players set eliminated_at=now(), elimination_reason='banished'
  where id=v_winner and game_id=p_game_id and eliminated_at is null;
  if v_game.host_player_id=v_winner then
    select id into v_next_host from public.players
    where game_id=p_game_id and eliminated_at is null order by random() limit 1;
  else v_next_host:=v_game.host_player_id; end if;
  update public.games set
    phase='results',last_banished_id=v_winner,last_banished_round=p_round,
    last_banished_role=(case when v_game.reveal_banished_role then
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

