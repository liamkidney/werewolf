// Timed, presentation-only substates within a persisted game phase.
// Add more entries to a phase's sequence to introduce additional suspense
// screens without database changes or new controller timer branches.
export const PRESENTATION_SEQUENCES = Object.freeze({
  results: Object.freeze([
    Object.freeze({ id: 'reveal', screen: 'banishment-screen', durationMs: 6000 })
  ]),
  dawn: Object.freeze([
    Object.freeze({ id: 'suspense', screen: 'suspense-screen', durationMs: 6000 }),
    Object.freeze({ id: 'reveal', screen: 'dawn-screen', durationMs: 6000 })
  ]),
  'seer-investigation': Object.freeze([
    Object.freeze({ id: 'result', screen: 'seer-result-screen', durationMs: 6000 })
  ])
});

export class PresentationFlow {
  constructor(sequences = PRESENTATION_SEQUENCES) {
    this.sequences = sequences;
  }

  duration(phase) {
    return (this.sequences[phase] || []).reduce((total, step) => total + step.durationMs, 0);
  }

  resolve(state, { now = Date.now(), startedAt = null } = {}) {
    const steps = this.sequences[state.phase];
    if (!steps) return null;

    const start = startedAt ?? Date.parse(state.phaseStartedAt || '');
    // A missing timestamp must never trap the player on a suspense screen.
    if (!Number.isFinite(start)) return { stage: state.phase + '.complete', screen: null };

    let elapsed = Math.max(0, now - start);
    for (const step of steps) {
      if (elapsed < step.durationMs) {
        return {
          stage: state.phase + '.' + step.id,
          screen: step.screen,
          durationMs: step.durationMs,
          elapsedMs: elapsed,
          remainingMs: step.durationMs - elapsed,
          progress: elapsed / step.durationMs
        };
      }
      elapsed -= step.durationMs;
    }
    return { stage: state.phase + '.complete', screen: null };
  }
}
