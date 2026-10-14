-- Atomic, idempotent results-to-night transition used by dev clients.
-- The existing host-operated phase transition remains intact for older clients.
create or replace function public.auto_start_night_after_banishment(
  p_game_id uuid, p_round integer
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  g public.games%rowtype;
  v_question text;
begin
  select * into g from public.games
  where id = p_game_id for update;

  if not found or g.status <> 'playing' or g.phase <> 'results'
     or g.round_number <> p_round
     or g.phase_started_at is null
     or clock_timestamp() < g.phase_started_at + interval '6 seconds' then
    return false;
  end if;

  select question into v_question
  from public.decoy_questions
  where active order by random() limit 1;

  if v_question is null then
    raise exception 'No active villager questions configured';
  end if;

  update public.games
  set phase = 'night', decoy_question = v_question
  where id = p_game_id
    and status = 'playing'
    and phase = 'results'
    and round_number = p_round;

  return found;
end;
$$;

revoke all on function public.auto_start_night_after_banishment(uuid,integer) from public;
grant execute on function public.auto_start_night_after_banishment(uuid,integer)
  to anon, authenticated;
