-- A rematch is a NEW lobby, not a reset of the finished game's history.
-- Both additions are nullable so old production clients remain compatible.
alter table public.games add column if not exists rematch_game_id uuid
  references public.games(id) on delete set null;
alter table public.players add column if not exists rematch_previous_player_id uuid
  references public.players(id) on delete set null;
create unique index if not exists players_rematch_previous_unique
  on public.players(rematch_previous_player_id)
  where rematch_previous_player_id is not null;

-- Only the current host can initiate a rematch, and only after game end.
-- Locking the finished game serializes concurrent button presses.
create or replace function public.start_game_rematch(
  p_game_id uuid, p_host uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.games%rowtype;
  v_new_id uuid;
  v_new_host uuid;
  v_new_player uuid;
  v_player public.players%rowtype;
begin
  select * into v_old from public.games where id=p_game_id for update;
  if not found or v_old.status <> 'finished'
     or v_old.host_player_id is distinct from p_host
     or not exists(select 1 from public.players where id=p_host and game_id=p_game_id)
  then
    raise exception 'Only the host can begin a new game after this game finishes';
  end if;

  -- Repeat calls return the exact same lobby: no duplicate rematches.
  if v_old.rematch_game_id is not null then return v_old.rematch_game_id; end if;

  insert into public.games(
    werewolf_count, werewolf_count_manual, seer_count, bodyguard_count,
    runoff_enabled, reveal_banished_role, day_duration_seconds
  ) values (
    v_old.werewolf_count, v_old.werewolf_count_manual,
    v_old.seer_count, v_old.bodyguard_count,
    v_old.runoff_enabled, v_old.reveal_banished_role,
    v_old.day_duration_seconds
  ) returning id into v_new_id;

  for v_player in
    select * from public.players where game_id=p_game_id order by joined_at,id
  loop
    insert into public.players(id,game_id,name,rematch_previous_player_id)
    values (gen_random_uuid(),v_new_id,v_player.name,v_player.id)
    returning id into v_new_player;
    if v_player.id=p_host then v_new_host:=v_new_player; end if;
  end loop;

  if v_new_host is null then raise exception 'Unable to transfer the host'; end if;
  update public.games set host_player_id=v_new_host where id=v_new_id;

  -- Updating the old game's row broadcasts the new lobby to all devices.
  update public.games set rematch_game_id=v_new_id where id=p_game_id;
  return v_new_id;
end;
$$;

-- Resolve a single participant's new identity. Never expose other mappings,
-- old secret roles, votes or elimination state.
create or replace function public.get_game_rematch_identity(
  p_game_id uuid, p_player_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_new_game uuid;
  v_player public.players%rowtype;
begin
  if not exists(
    select 1 from public.players
    where id=p_player_id and game_id=p_game_id
  ) then raise exception 'Not a member of the finished game'; end if;

  select rematch_game_id into v_new_game from public.games where id=p_game_id;
  if v_new_game is null then return null; end if;

  select * into v_player from public.players
  where game_id=v_new_game and rematch_previous_player_id=p_player_id;
  if not found then raise exception 'Your new-game invitation is missing'; end if;

  return jsonb_build_object(
    'game_id',v_new_game,
    'player_id',v_player.id,
    'session_generation',v_player.session_generation,
    'name',v_player.name
  );
end;
$$;

revoke all on function public.start_game_rematch(uuid,uuid) from public;
revoke all on function public.get_game_rematch_identity(uuid,uuid) from public;
grant execute on function public.start_game_rematch(uuid,uuid) to anon,authenticated;
grant execute on function public.get_game_rematch_identity(uuid,uuid) to anon,authenticated;
