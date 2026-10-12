-- Backwards-compatible persisted lifecycle step; legacy clients can continue using phase.
alter table public.games add column if not exists step text;
update public.games set step = case
  when status='lobby' then 'waiting'
  when phase='reveal' then 'roles'
  when phase='results' then 'announcement'
  when phase='night' then 'actions'
  when phase='day' and (discussion_ended_at is not null or
    (phase_started_at is not null and phase_started_at + make_interval(secs => day_duration_seconds) <= now())) then 'voting'
  when phase='day' then 'discussion'
  else 'waiting' end
where step is null;
alter table public.games alter column step set default 'waiting';
alter table public.games alter column step set not null;
alter table public.games add constraint games_step_valid check (step in ('waiting','roles','discussion','voting','announcement','actions'));

create or replace function public.set_game_phase_timestamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.phase is distinct from old.phase then
    new.phase_started_at := now();
    new.step := case new.phase
      when 'reveal' then 'roles'
      when 'day' then 'discussion'
      when 'results' then 'announcement'
      when 'night' then 'actions'
      else 'waiting' end;
    if new.phase = 'day' then new.discussion_ended_at := null; end if;
  elsif new.phase = 'day' and new.discussion_ended_at is not null
    and old.discussion_ended_at is distinct from new.discussion_ended_at then
    new.step := 'voting';
  end if;
  return new;
end $$;

-- Any client may request this idempotent, timer-validated transition.
-- The UPDATE row lock serializes concurrent requests; only one wins.
create or replace function public.open_day_voting(p_game_id uuid, p_round integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_changed integer;
begin
  update public.games
     set step='voting'
   where id=p_game_id and status='playing' and phase='day'
     and round_number=p_round and step='discussion'
     and phase_started_at is not null
     and (discussion_ended_at is not null
       or now() >= phase_started_at + make_interval(secs => day_duration_seconds));
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end $$;
revoke all on function public.open_day_voting(uuid,integer) from public;
grant execute on function public.open_day_voting(uuid,integer) to anon,authenticated;
