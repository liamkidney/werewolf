-- Relay runoff ballot progress to every active player, like original day votes.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public' and tablename='day_runoff_votes'
    ) then
    alter publication supabase_realtime add table public.day_runoff_votes;
  end if;
end;
$$;
