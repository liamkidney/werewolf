-- Canonical list of villager night questions. Edit this file to maintain the question bank.
create table if not exists public.decoy_questions (
  id integer generated always as identity primary key,
  question text not null unique,
  active boolean not null default true
);
insert into public.decoy_questions(question) values
  ('Who is least trustworthy?'),
  ('Who might betray you?'),
  ('Who is hiding the biggest secret?'),
  ('Who would abandon the group first?'),
  ('Who is the most suspicious?'),
  ('Who would make the best double agent?'),
  ('Who is most likely to be bluffing?'),
  ('Who would you least trust with a secret?')
on conflict (question) do nothing;

-- Choose once per round, inside the host-controlled transition, for every player.
create or replace function public.advance_game_phase(p_game_id uuid, p_host uuid, p_phase text, p_round integer)
returns void language plpgsql security definer set search_path to ''
as $$
declare g public.games%rowtype; v_question text;
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
  select question into v_question from public.decoy_questions where active order by random() limit 1;
  if v_question is null then raise exception 'No active villager questions configured'; end if;
  update public.games set phase='night',round_number=p_round+1,decoy_question=v_question where id=p_game_id;
 else raise exception 'Manual transition not permitted from %',p_phase;
 end if;
end $$;
