-- Reveal the other werewolves during initial role assignment.
-- Keep the night-voting RPC separate; it should not be callable before night.
create or replace function public.get_werewolf_packmates(
  p_game_id uuid, p_player_id uuid
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.games g
    join public.players requester on requester.game_id = g.id
    join public.player_roles r on r.game_id = g.id and r.player_id = requester.id
    where g.id = p_game_id and g.status = 'playing' and g.phase = 'reveal'
      and requester.id = p_player_id and requester.eliminated_at is null
      and r.role = 'werewolf'
  ) then
    raise exception 'Only active werewolves can view their packmates during role reveal';
  end if;

  return (
    select coalesce(jsonb_agg(other.name order by other.joined_at, other.id), '[]'::jsonb)
    from public.players other
    join public.player_roles r on r.game_id = other.game_id and r.player_id = other.id
    where other.game_id = p_game_id and other.id <> p_player_id
      and other.eliminated_at is null and r.role = 'werewolf'
  );
end;
$$;
revoke all on function public.get_werewolf_packmates(uuid,uuid) from public;
grant execute on function public.get_werewolf_packmates(uuid,uuid) to anon, authenticated;
