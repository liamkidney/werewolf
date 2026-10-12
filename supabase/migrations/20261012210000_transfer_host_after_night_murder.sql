do $$
declare fn text;
begin
 select pg_get_functiondef('public.cast_night_vote(uuid,integer,uuid,uuid)'::regprocedure) into fn;
 if position('update public.games set phase=''dawn'',last_murdered_id=v_victim,last_murdered_round=p_round where id=p_game_id;' in fn)=0
 then raise exception 'Unexpected night vote function'; end if;
 fn:=replace(fn,
 'update public.games set phase=''dawn'',last_murdered_id=v_victim,last_murdered_round=p_round where id=p_game_id;',
 'update public.games set phase=''dawn'',last_murdered_id=v_victim,last_murdered_round=p_round,
 host_player_id=case when v_game.host_player_id=v_victim then
 (select id from public.players where game_id=p_game_id and eliminated_at is null order by random() limit 1)
 else v_game.host_player_id end where id=p_game_id;');
 execute fn;
end $$;