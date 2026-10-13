import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GameState } from './game-state.js';

const db = createClient(
  'https://guldhewlhxhsxchbattf.supabase.co',
  'sb_publishable_6g3XdNkAJesxzGzFZ9ulYg_redoxZWj'
);

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}

export class GameRepository {
  constructor(client = db) { this.db = client; }

  async createGame() {
    return unwrap(await this.db.from('games').insert({ seer_count: 1 }).select('id').single()).id;
  }

  async getGame(gameId) {
    return unwrap(await this.db.from('games').select('id,status,werewolf_count,seer_count,phase,step,round_number,phase_started_at,day_duration_seconds,discussion_ended_at,last_banished_id,last_banished_round,last_murdered_id,last_murdered_round,host_player_id,decoy_question,winner').eq('id', gameId).maybeSingle());
  }

  async hasPlayer(gameId, playerId) {
    return !!unwrap(await this.db.from('players').select('id').eq('id', playerId).eq('game_id', gameId).maybeSingle());
  }

  async joinGame(gameId, playerId, name) {
    unwrap(await this.db.from('players').upsert(
      { id: playerId, game_id: gameId, name }, { onConflict: 'id' }
    ));
  }

  async claimHost(gameId, playerId) {
    return unwrap(await this.db.rpc('claim_game_host', { p_game_id: gameId, p_player_id: playerId }));
  }

  async getState(gameId) {
    const [game, players, votes] = await Promise.all([
      this.getGame(gameId),
      this.db.from('players').select('id,name,eliminated_at,elimination_reason').eq('game_id', gameId).order('joined_at').then(unwrap),
      this.db.from('day_votes').select('voter_id,target_id,round_number').eq('game_id', gameId).then(unwrap)
    ]);
    if (!game) throw new Error('Game not found.');
    return new GameState({
      id: game.id, status: game.status, phase: game.phase, step: game.step, roundNumber: game.round_number, werewolfCount: game.werewolf_count, seerCount: game.seer_count ?? 0, players, votes,
      phaseStartedAt: game.phase_started_at, dayDurationSeconds: game.day_duration_seconds, discussionEndedAt: game.discussion_ended_at, lastBanishedId: game.last_banished_id, lastBanishedRound: game.last_banished_round,
      lastMurderedId: game.last_murdered_id, lastMurderedRound: game.last_murdered_round, hostPlayerId: game.host_player_id, decoyQuestion: game.decoy_question, winner: game.winner
    });
  }

  async getMyRole(gameId, playerId) {
    return unwrap(await this.db.from('player_roles').select('role')
      .eq('game_id', gameId).eq('player_id', playerId).maybeSingle())?.role ?? null;
  }

  async setWerewolfCount(gameId, count) {
    unwrap(await this.db.rpc('set_lobby_werewolf_count_manual', { p_game_id: gameId, p_count: count }));
  }

  async setSeerCount(gameId, hostId, count) {
    unwrap(await this.db.rpc('set_lobby_seer_count', {
      p_game_id: gameId, p_host: hostId, p_count: count
    }));
  }

  async startGame(state, assignments) {
    unwrap(await this.db.rpc('start_werewolf_game', {
      p_game_id: state.id,
      p_assignments: assignments.map(({ player_id, role }) => ({ player_id, role }))
    }));
  }

  async advancePhase(state, next, hostId) {
    const permitted = state.phase === 'reveal' && next.phase === 'day';
    if (!permitted) throw new Error('Invalid requested phase transition.');
    unwrap(await this.db.rpc('advance_game_phase', {
      p_game_id: state.id, p_host: hostId, p_phase: state.phase, p_round: state.roundNumber
    }));
  }

  async autoStartDay(gameId, round) {
    return unwrap(await this.db.rpc('auto_start_day_after_dawn', {
      p_game_id: gameId, p_round: round
    }));
  }

  async autoStartNight(gameId, round) {
    return unwrap(await this.db.rpc('auto_start_night_after_banishment', {
      p_game_id: gameId, p_round: round
    }));
  }

  async openDayVoting(gameId, round) {
    return unwrap(await this.db.rpc('open_day_voting', { p_game_id: gameId, p_round: round }));
  }

  async endDiscussion(gameId, playerId) {
    unwrap(await this.db.rpc('end_day_discussion', { p_game_id: gameId, p_host: playerId }));
  }

  async castVote(gameId, round, voterId, targetId) {
    unwrap(await this.db.rpc('cast_day_vote', {
      p_game_id: gameId, p_round: round, p_voter: voterId, p_target: targetId
    }));
  }

  async finishDay(gameId, round) {
    return unwrap(await this.db.rpc('finish_day_vote', { p_game_id: gameId, p_round: round }));
  }

  async castDecoyVote(gameId, round, voterId, targetId) {
    return unwrap(await this.db.rpc('cast_decoy_vote', { p_game_id: gameId, p_round: round, p_voter: voterId, p_target: targetId }));
  }

  async getDecoyPack(gameId, playerId) {
    return unwrap(await this.db.rpc('get_decoy_pack', { p_game_id: gameId, p_player_id: playerId }));
  }

  async getFinalRoles(gameId) {
    return unwrap(await this.db.rpc('get_final_roles', { p_game_id: gameId }));
  }

  async getNightPack(gameId, playerId) {
    return unwrap(await this.db.rpc('get_night_pack', { p_game_id: gameId, p_player_id: playerId }));
  }

  async castNightVote(gameId, round, voterId, targetId) {
    return unwrap(await this.db.rpc('cast_night_vote', {
      p_game_id: gameId, p_round: round, p_voter: voterId, p_target: targetId
    }));
  }

  async getSeerPack(gameId, seerId) {
    return unwrap(await this.db.rpc('get_seer_pack', {
      p_game_id: gameId, p_seer: seerId
    }));
  }

  async castSeerInvestigation(gameId, round, seerId, targetId) {
    return unwrap(await this.db.rpc('cast_seer_investigation', {
      p_game_id: gameId, p_round: round, p_seer: seerId, p_target: targetId
    }));
  }

  subscribeToGame(gameId, onChange) {
    return this.db.channel('lobby-' + gameId)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'players', filter: 'game_id=eq.' + gameId
      }, onChange)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'games', filter: 'id=eq.' + gameId
      }, onChange)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'player_roles', filter: 'game_id=eq.' + gameId
      }, onChange)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'day_votes', filter: 'game_id=eq.' + gameId
      }, onChange);
  }

  async disposeChannel(channel) {
    if (channel) await this.db.removeChannel(channel);
  }
}
