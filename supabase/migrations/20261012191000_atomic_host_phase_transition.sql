-- Host-only atomic transition for the two manual lifecycle commands.
create or replace function public.advance_game_phase(p_game_id uuid, p_host uuid, p_phase text, p_round integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_game public.games%rowtype;
begin
  select * into v_game from public.games where id=p_game_id for update;
  if not found or v_game.status <> 'playing' or v_game.host_player_id is distinct from p_host
    or v_game.phase is distinct from p_phase or v_game.round_number <> p_round
  then raise exception 'Not host or game state has changed'; end if;
  if p_phase = 'reveal' then
    update public.games set phase='day' where id=p_game_id;
  elsif p_phase = 'results' then
    update public.games set phase='night',round_number=p_round+1 where id=p_game_id;
  else
    raise exception 'Manual transition not permitted from %', p_phase;
  end if;
end $$;
revoke all on function public.advance_game_phase(uuid,uuid,text,integer) from public;
grant execute on function public.advance_game_phase(uuid,uuid,text,integer) to anon,authenticated;
