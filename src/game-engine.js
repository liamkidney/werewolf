// Pure rules: no Supabase, DOM, localStorage or network calls.
export class GameEngine {
  canStart(state) {
    return state.status === 'lobby' && state.players.length > state.werewolfCount
      && state.werewolfCount >= 1 && state.werewolfCount <= 50;
  }

  nextWerewolfCount(state, delta) {
    return Math.max(1, Math.min(50, state.werewolfCount + delta));
  }

  assignRoles(state, randomInt) {
    if (!this.canStart(state)) throw new Error('You need more players than werewolves.');
    const players = [...state.players];
    for (let i = players.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Invalid random index.');
      [players[i], players[j]] = [players[j], players[i]];
    }
    return players.map((player, index) => ({
      player_id: player.id,
      game_id: state.id,
      role: index < state.werewolfCount ? 'werewolf' : 'villager'
    }));
  }
}

// Cryptographically secure unbiased index; injected to keep GameEngine testable.
export function secureRandomInt(maxExclusive) {
  const range = 0x100000000;
  const limit = range - (range % maxExclusive);
  const sample = new Uint32Array(1);
  do { crypto.getRandomValues(sample); } while (sample[0] >= limit);
  return sample[0] % maxExclusive;
}
