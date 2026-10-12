import { DEFAULT_RULES } from './game-rules.js';

// Pure state/command evaluation. No database, browser, or side effects.
// The repository must still enforce these invariants inside transactions.
export class StateEngine {
  constructor(rules = DEFAULT_RULES) { this.rules = rules; }

  step(state, now = Date.now()) {
    if (state.status !== 'playing') return state.status === 'lobby' ? 'waiting' : 'finished';
    if (state.step) return state.step;
    if (state.phase === 'reveal') return 'roles';
    if (state.phase === 'results') return 'announcement';
    if (state.phase === 'night') return 'actions';
    if (state.phase === 'day') {
      const deadline = Date.parse(state.phaseStartedAt || '') + (state.dayDurationSeconds ?? this.rules.discussionSeconds) * 1000;
      return state.discussionEndedAt || (Number.isFinite(deadline) && now >= deadline) ? 'voting' : 'discussion';
    }
    throw new Error('Unknown game phase: ' + state.phase);
  }

  requiredNightActions(roles) {
    const activeRoles = new Set(roles.filter(player => !player.eliminated_at).map(player => player.role));
    return Object.entries(this.rules.nightActions)
      .filter(([, action]) => activeRoles.has(action.role))
      .map(([type, action]) => ({ type, ...action }));
  }

  evaluateNightAction(action, actors, votes) {
    const active = actors.filter(player => !player.eliminated_at);
    const byActor = new Map(votes.filter(v => active.some(p => p.id === v.voter_id)).map(v => [v.voter_id, v.target_id]));
    if (!active.length) return { complete: true, targetId: null };
    if (byActor.size !== active.length) return { complete: false, targetId: null };
    const targets = new Set(byActor.values());
    if (action.consensus === 'unanimous' && targets.size !== 1) return { complete: false, targetId: null };
    return { complete: true, targetId: targets.size === 1 ? [...targets][0] : null };
  }

  transition(state, command) {
    if (state.status !== 'playing') throw new Error('Game is not in progress.');
    if (command.type === 'START_DAY' && state.phase === 'reveal') {
      return { phase: 'day', roundNumber: state.roundNumber };
    }
    if (command.type === 'START_NIGHT' && state.phase === 'results') {
      return { phase: 'night', roundNumber: state.roundNumber + 1 };
    }
    throw new Error('Transition is not permitted from this state.');
  }
}
