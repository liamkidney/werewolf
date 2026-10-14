// Client-side trigger for the database-owned automatic phase transitions.
// The RPCs validate the game, round, phase and deadline atomically. The
// coordinator only decides when to ask and when to retry stale snapshots.
export class PhaseAdvancer {
  constructor({
    repository,
    getState,
    can,
    requestRefresh,
    reportError,
    now = () => Date.now(),
    schedule = (fn, delay) => setTimeout(fn, delay),
    cancel = timer => clearTimeout(timer)
  }) {
    this.repository = repository;
    this.getState = getState;
    this.can = can;
    this.requestRefresh = requestRefresh;
    this.reportError = reportError;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.advancing = false;
    this.retryTimer = null;
    this.nextAttemptAt = 0;
  }

  static commandFor(phase) {
    return phase === 'dawn' ? 'AUTO_START_DAY'
      : phase === 'results' ? 'AUTO_START_NIGHT' : null;
  }

  stopRetry() {
    if (this.retryTimer !== null) this.cancel(this.retryTimer);
    this.retryTimer = null;
    this.nextAttemptAt = 0;
  }

  reset() {
    this.stopRetry();
    this.advancing = false;
  }

  scheduleRetry() {
    if (this.retryTimer !== null) return;
    this.retryTimer = this.schedule(() => {
      this.retryTimer = null;
      const state = this.getState();
      if (state.status === 'playing' && PhaseAdvancer.commandFor(state.phase)) {
        this.requestRefresh();
      }
    }, 1500);
  }

  async advance() {
    const state = this.getState();
    const command = PhaseAdvancer.commandFor(state.phase);
    if (!command || this.advancing || !this.can(command)
      || this.now() < this.nextAttemptAt) return false;

    this.advancing = true;
    this.nextAttemptAt = this.now() + 1400;
    const { id: gameId, roundNumber: round } = state;
    try {
      const changed = state.phase === 'dawn'
        ? await this.repository.autoStartDay(gameId, round)
        : await this.repository.autoStartNight(gameId, round);
      if (this.getState().id !== gameId) return false;
      if (changed) this.requestRefresh();
      else this.scheduleRetry();
      return changed;
    } catch (error) {
      if (this.getState().id === gameId) {
        this.reportError(error.message || 'Could not advance the game.');
        this.scheduleRetry();
      }
      return false;
    } finally {
      this.advancing = false;
    }
  }
}
