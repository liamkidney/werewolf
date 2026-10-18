-- The information card must retain PUBLIC roles from every banishment,
-- rather than only the most recent banished role on games.
-- NULL means no role is publicly disclosed (e.g. host opted out).
alter table public.players
  add column if not exists revealed_banished_role text
  check (revealed_banished_role in ('villager', 'seer', 'werewolf'));

-- Carry over earlier banishments in games where the host enabled role reveals.
-- Roles for hidden-role games are never copied into the public players table.
update public.players p
set revealed_banished_role = r.role
from public.games g, public.player_roles r
where g.id = p.game_id
  and g.reveal_banished_role = true
  and p.elimination_reason = 'banished'
  and p.eliminated_at is not null
  and r.game_id = p.game_id
  and r.player_id = p.id
  and p.revealed_banished_role is distinct from r.role;

-- This trigger fires during the existing finish_day_vote transaction.
-- It records only what the game's rules already made public.
create or replace function public.record_revealed_banished_role()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.reveal_banished_role and new.last_banished_id is not null then
    update public.players p
    set revealed_banished_role = r.role
    from public.player_roles r
    where p.id = new.last_banished_id
      and p.game_id = new.id
      and p.eliminated_at is not null
      and p.elimination_reason = 'banished'
      and r.player_id = p.id
      and r.game_id = p.game_id;
  end if;
  return new;
end;
$$;

revoke all on function public.record_revealed_banished_role()
  from public, anon, authenticated;

drop trigger if exists record_revealed_banished_role on public.games;
create trigger record_revealed_banished_role
after update of last_banished_id on public.games
for each row
when (old.last_banished_id is distinct from new.last_banished_id)
execute function public.record_revealed_banished_role();
