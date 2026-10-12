-- Recommended werewolf count for smaller games; preserve manual lobby overrides.
alter table public.games alter column werewolf_count set default 1;
alter table public.games add column if not exists werewolf_count_manual boolean not null default false;

create or replace function public.set_lobby_werewolf_count()
returns trigger language plpgsql security definer set search_path to ''
as $$
declare v_count integer;
begin
 select count(*) into v_count from public.players where game_id=new.game_id;
 update public.games set werewolf_count=case
  when v_count<=6 then 1
  when v_count<=9 then 2
  when v_count<=12 then 3
  else greatest(3,ceil(v_count::numeric/4)::integer)
 end
 where id=new.game_id and status='lobby' and not werewolf_count_manual;
 return new;
end $$;

drop trigger if exists players_recommend_werewolf_count on public.players;
create trigger players_recommend_werewolf_count after insert on public.players
for each row execute function public.set_lobby_werewolf_count();

create or replace function public.set_lobby_werewolf_count_manual(p_game_id uuid,p_count integer)
returns void language plpgsql security definer set search_path to ''
as $$
begin
 if p_count<1 or p_count>50 then raise exception 'Invalid werewolf count'; end if;
 update public.games set werewolf_count=p_count,werewolf_count_manual=true
 where id=p_game_id and status='lobby';
 if not found then raise exception 'Lobby is no longer available'; end if;
end $$;
