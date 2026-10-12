// Immutable snapshot of persisted game data. No browser or database dependencies.
export class GameState {
  constructor({ id = null, status = 'lobby', phase = 'reveal', step = null, roundNumber = 1, werewolfCount = 2, players = [], phaseStartedAt = null, dayDurationSeconds = 120, discussionEndedAt = null, lastBanishedId = null, lastBanishedRound = null, lastMurderedId = null, lastMurderedRound = null, hostPlayerId = null, decoyQuestion = null, winner = null, votes = [] } = {}) {
    this.id = id;
    this.status = status;
    this.phase = phase;
    this.step = step;
    this.roundNumber = roundNumber;
    this.werewolfCount = werewolfCount;
    this.phaseStartedAt = phaseStartedAt;
    this.dayDurationSeconds = dayDurationSeconds;
    this.discussionEndedAt = discussionEndedAt;
    this.lastBanishedId = lastBanishedId;
    this.lastBanishedRound = lastBanishedRound;
    this.lastMurderedId = lastMurderedId;
    this.lastMurderedRound = lastMurderedRound;
    this.hostPlayerId = hostPlayerId;
    this.decoyQuestion = decoyQuestion;
    this.winner = winner;
    this.votes = Object.freeze(votes.map(vote => Object.freeze({ ...vote })));
    this.players = Object.freeze(players.map(player => Object.freeze({ ...player })));
    Object.freeze(this);
  }

  with(changes) {
    return new GameState({ ...this, ...changes });
  }

  get villagerCount() { return Math.max(0, this.players.length - this.werewolfCount); }
}
