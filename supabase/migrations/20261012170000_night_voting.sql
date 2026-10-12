-- Night voting is additive: existing production RPCs remain unchanged.
create table if not exists public.night_votes (
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null,
  voter_id uuid not null references public.players(id),
  target_id uuid not null references public.players(id),
  updated_at timestamptz not null default now(),
  primary key (game_id, round_number, voter_id)
);
alter table public.night_votes enable row level security;
grant select on public.night_votes to anon, authenticated;
create policy "MVP night votes read" on public.night_votes for select to anon, authenticated using (true);
-- Existing anonymous player identity is client-provided, so this is MVP identity checking, not secure authentication.
create or replace function public.get_night_pack(p_game_id uuid, p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
 if not exists (
   select 1 from public.games g join public.players p on p.game_id=g.id
   join public.player_roles r on r.player_id=p.id and r.game_id=g.id
   where g.id=p_game_id and g.phase='night' and g.status='playing'
     and p.id=p_player_id and p.eliminated_at is null and r.role='werewolf'
 ) then raise exception 'Not an active werewolf in this night'; end if;
 select jsonb_build_object(
   'wolves',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.joined_at)
     from public.players p join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
     where p.game_id=p_game_id and p.eliminated_at is null and r.role='werewolf'),'[]'::jsonb),
   'votes',coalesce((select jsonb_agg(jsonb_build_object('voter_id',v.voter_id,'target_id',v.target_id))
     from public.night_votes v join public.games g on g.id=v.game_id
     where v.game_id=p_game_id and v.round_number=g.round_number),'[]'::jsonb)
 ) into v_result;
 return v_result;
end $$;
create or replace function public.cast_night_vote(p_game_id uuid,p_round integer,p_voter uuid,p_target uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_game public.games%rowtype; v_wolves integer; v_votes integer; v_distinct integer; v_victim uuid;
begin
 select * into v_game from public.games where id=p_game_id for update;
 if not found or v_game.status<>'playing' or v_game.phase<>'night' or v_game.round_number<>p_round
 then raise exception 'Night voting is no longer active'; end if;
 if not exists (select 1 from public.players p join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
    where p.game_id=p_game_id and p.id=p_voter and p.eliminated_at is null and r.role='werewolf')
 then raise exception 'Only active werewolves may vote'; end if;
 if not exists (select 1 from public.players p join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
    where p.game_id=p_game_id and p.id=p_target and p.eliminated_at is null and r.role='villager')
 then raise exception 'Target must be an active villager'; end if;
 insert into public.night_votes(game_id,round_number,voter_id,target_id)
 values(p_game_id,p_round,p_voter,p_target)
 on conflict(game_id,round_number,voter_id) do update set target_id=excluded.target_id,updated_at=now();
 select count(*) into v_wolves from public.players p join public.player_roles r on r.player_id=p.id and r.game_id=p.game_id
 where p.game_id=p_game_id and p.eliminated_at is null and r.role='werewolf';
 select count(*),count(distinct target_id),min(target_id) into v_votes,v_distinct,v_victim
 from public.night_votes where game_id=p_game_id and round_number=p_round;
 if v_votes=v_wolves and v_distinct=1 then
   update public.players set eliminated_at=now() where id=v_victim and game_id=p_game_id and eliminated_at is null;
   update public.games set phase='day',phase_started_at=now(),discussion_ended_at=null where id=p_game_id;
   return v_victim;
 end if;
 return null;
end $$;
revoke all on function public.get_night_pack(uuid,uuid) from public;
revoke all on function public.cast_night_vote(uuid,integer,uuid,uuid) from public;
grant execute on function public.get_night_pack(uuid,uuid) to anon,authenticated;
grant execute on function public.cast_night_vote(uuid,integer,uuid,uuid) to anon,authenticated;
