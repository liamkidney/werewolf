// Immutable snapshot of persisted game data. No browser or database dependencies.
export class GameState {
  constructor({ id = null, status = 'lobby', werewolfCount = 2, players = [], roles = [] } = {}) {
    this.id = id;
    this.status = status;
    this.werewolfCount = werewolfCount;
    this.players = Object.freeze(players.map(player => Object.freeze({ ...player })));
    this.roles = Object.freeze(roles.map(role => Object.freeze({ ...role })));
    Object.freeze(this);
  }

  with(changes) {
    return new GameState({ ...this, ...changes });
  }

  get villagerCount() { return Math.max(0, this.players.length - this.werewolfCount); }
  roleFor(playerId) { return this.roles.find(role => role.player_id === playerId)?.role ?? null; }
}
