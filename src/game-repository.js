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
    return unwrap(await this.db.from('games').insert({}).select('id').single()).id;
  }

  async getGame(gameId) {
    return unwrap(await this.db.from('games').select('id,status,werewolf_count,phase,round_number').eq('id', gameId).maybeSingle());
  }

  async hasPlayer(gameId, playerId) {
    return !!unwrap(await this.db.from('players').select('id').eq('id', playerId).eq('game_id', gameId).maybeSingle());
  }

  async joinGame(gameId, playerId, name) {
    unwrap(await this.db.from('players').upsert(
      { id: playerId, game_id: gameId, name }, { onConflict: 'id' }
    ));
  }

  async getState(gameId) {
    const [game, players] = await Promise.all([
      this.getGame(gameId),
      this.db.from('players').select('id,name').eq('game_id', gameId).order('joined_at').then(unwrap)
    ]);
    if (!game) throw new Error('Game not found.');
    return new GameState({
      id: game.id, status: game.status, phase: game.phase, roundNumber: game.round_number, werewolfCount: game.werewolf_count, players
    });
  }

  async getMyRole(gameId, playerId) {
    return unwrap(await this.db.from('player_roles').select('role')
      .eq('game_id', gameId).eq('player_id', playerId).maybeSingle())?.role ?? null;
  }

  async setWerewolfCount(gameId, count) {
    unwrap(await this.db.from('games').update({ werewolf_count: count }).eq('id', gameId).eq('status', 'lobby'));
  }

  async startGame(state, assignments) {
    // MVP uses client-side assignment; a future server transaction should make this atomic.
    unwrap(await this.db.from('player_roles').insert(assignments));
    const updated = unwrap(await this.db.from('games').update({ status: 'playing' })
      .eq('id', state.id).eq('status', 'lobby').select('id'));
    if (!updated.length) throw new Error('Game was already started.');
  }

  async advancePhase(state, next) {
    const updated = unwrap(await this.db.from('games')
      .update({ phase: next.phase, round_number: next.roundNumber })
      .eq('id', state.id).eq('status', 'playing')
      .eq('phase', state.phase).eq('round_number', state.roundNumber)
      .select('id'));
    if (!updated.length) throw new Error('The phase changed on another device. Refresh and try again.');
  }

  async disposeChannel(channel) {
    if (channel) await this.db.removeChannel(channel);
  }
}
