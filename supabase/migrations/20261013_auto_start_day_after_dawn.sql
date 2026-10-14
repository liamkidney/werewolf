-- Idempotent, race-safe dawn-to-day transition for the dev client.
-- Unlike advance_game_phase, any connected, surviving client may request this,
-- but the database enforces the full presentation interval and game state.
-- The existing host-operated function remains unchanged for production clients.
create or replace function public.auto_start_day_after_dawn(
  p_game_id uuid, p_round integer
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_advanced integer;
begin
  update public.games
  set phase = 'day'
  where id = p_game_id
    and status = 'playing'
    and phase = 'dawn'
    and round_number = p_round
    and phase_started_at is not null
    and clock_timestamp() >= phase_started_at + interval '12 seconds';
  get diagnostics v_advanced = row_count;
  return v_advanced = 1;
end;
$$;
revoke all on function public.auto_start_day_after_dawn(uuid,integer) from public;
grant execute on function public.auto_start_day_after_dawn(uuid,integer) to anon, authenticated;
