// Client-local presentation state, independent of persisted game phases.
// Owns only countdowns and per-player reveal timing, not game rules or RPCs.
export class PresentationController {
  constructor({
    stateEngine,
    requestRefresh,
    now = () => Date.now(),
    schedule = (fn, delay) => setTimeout(fn, delay),
    cancel = timer => clearTimeout(timer)
  }) {
    this.stateEngine = stateEngine;
    this.requestRefresh = requestRefresh;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.timer = null;
    this.holdTimer = null;
    this.seerResult = null;
    this.victim = null;
    this.farewellUntil = 0;
  }

  stopStep() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
  }

  stopHold() {
    if (this.holdTimer !== null) this.cancel(this.holdTimer);
    this.holdTimer = null;
  }

  reset() {
    this.stopStep();
    this.stopHold();
    this.seerResult = null;
    this.victim = null;
    this.farewellUntil = 0;
  }

  show(step, render) {
    render(step);
    this.stopStep();
    this.timer = this.schedule(() => {
      this.timer = null;
      this.requestRefresh();
    }, step.remainingMs + 30);
  }

  hold(remainingMs) {
    if (remainingMs <= 0 || this.holdTimer !== null) return;
    this.holdTimer = this.schedule(() => {
      this.holdTimer = null;
      this.requestRefresh();
    }, remainingMs + 30);
  }

  startSeerResult(result) {
    this.seerResult = { ...result, startedAt: this.now() };
  }

  currentSeerStep() {
    if (!this.seerResult) return null;
    const step = this.stateEngine.presentation({ phase: 'seer-investigation' }, {
      now: this.now(), startedAt: this.seerResult.startedAt
    });
    if (!step?.screen) {
      this.seerResult = null;
      return null;
    }
    return step;
  }

  victimSuspenseStep(state, playerId) {
    // Anchor the private suspense to when the victim learns about the murder;
    // an overdue realtime update must not skip the announcement.
    if (!this.victim && state.phase === 'dawn'
      && state.lastMurderedId === playerId) {
      this.victim = { gameId: state.id, startedAt: this.now() };
    }
    if (this.victim?.gameId !== state.id) return null;
    const step = this.stateEngine.presentation({ ...state, phase: 'dawn' }, {
      now: this.now(), startedAt: this.victim.startedAt
    });
    // The public murder reveal must not replace the victim's farewell.
    return step?.stage === 'dawn.suspense' ? step : null;
  }

  holdVictimFarewell(state, playerId) {
    if (!this.victim || this.victim.gameId !== state.id
      || state.lastMurderedId !== playerId) return false;
    if (!this.farewellUntil) this.farewellUntil = this.now() + 4000;
    const remaining = this.farewellUntil - this.now();
    if (remaining <= 0) return false;
    this.hold(remaining);
    return true;
  }
}
