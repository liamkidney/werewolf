// Immutable snapshot of persisted game data. No browser or database dependencies.
export class GameState {
  constructor({ id = null, status = 'lobby', phase = 'reveal', roundNumber = 1, werewolfCount = 2, players = [], myRole = null } = {}) {
    this.id = id;
    this.status = status;
    this.phase = phase;
    this.roundNumber = roundNumber;
    this.werewolfCount = werewolfCount;
    this.players = Object.freeze(players.map(player => Object.freeze({ ...player })));
    this.myRole = myRole;
    Object.freeze(this);
  }

  with(changes) {
    return new GameState({ ...this, ...changes });
  }

  get villagerCount() { return Math.max(0, this.players.length - this.werewolfCount); }
}
