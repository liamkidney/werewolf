import { DEFAULT_RULES } from './game-rules.js';
import { PresentationFlow } from './presentation-flow.js';
import { RoleRegistry } from './role-registry.js';

// Pure state/command evaluation. No database, browser, or side effects.
// The repository must still enforce these invariants inside transactions.
export class StateEngine {
  constructor(rules = DEFAULT_RULES, presentationFlow = new PresentationFlow(), roleRegistry = new RoleRegistry(rules.roles)) {
    this.rules = rules;
    this.presentationFlow = presentationFlow;
    this.roles = roleRegistry;
  }

  presentation(state, options = {}) {
    return this.presentationFlow.resolve(state, options);
  }

  presentationDuration(phase) {
    return this.presentationFlow.duration(phase);
  }

  step(state, now = Date.now()) {
    if (state.status !== 'playing') return state.status === 'lobby' ? 'waiting' : 'finished';
    if (state.step) return state.step;
    if (state.phase === 'reveal') return 'roles';
    if (state.phase === 'results') return 'announcement';
    if (state.phase === 'dawn') return 'murder_reveal';
    if (state.phase === 'night') return 'actions';
    if (state.phase === 'day') {
      const deadline = Date.parse(state.phaseStartedAt || '') + (state.dayDurationSeconds ?? this.rules.discussionSeconds) * 1000;
      return state.discussionEndedAt || (Number.isFinite(deadline) && now >= deadline) ? 'voting' : 'discussion';
    }
    throw new Error('Unknown game phase: ' + state.phase);
  }

  // A single projection of persisted gameplay and the viewer's public
  // elimination status into UI state. Secret role data is not embedded here.
  // Personal reveals (Seer result, victim farewell) can temporarily override
  // this view in PresentationController without altering persisted phase.
  view(state, { playerId = null, now = Date.now() } = {}) {
    const player = playerId ? state.players?.find(p => p.id === playerId) : null;
    const playerStatus = player?.eliminated_at ? 'eliminated' : 'active';
    let stage;
    if (state.status === 'finished') stage = 'finished';
    else if (playerStatus === 'eliminated') stage = 'eliminated';
    else if (state.status === 'lobby') stage = 'lobby';
    else if (state.status !== 'playing') throw new Error('Unknown game status: ' + state.status);
    else if (state.phase === 'day') stage = this.step(state, now) === 'voting' ? 'day.voting' : 'day.discussion';
    else {
      const presentation = this.presentation(state, { now });
      stage = presentation ? presentation.stage : state.phase;
      if (!['reveal', 'night', 'results', 'dawn'].includes(state.phase)) {
        throw new Error('Unknown game phase: ' + state.phase);
      }
    }
    const presentation = state.status === 'playing' && playerStatus === 'active'
      ? this.presentation(state, { now })
      : null;
    return {
      stage,
      playerStatus,
      presentation: presentation?.screen ? presentation : null
    };
  }

  stage(state, playerId = null, now = Date.now()) {
    return this.view(state, { playerId, now }).stage;
  }

  // Command eligibility is evaluated in one place; the repository remains
  // responsible for transactional enforcement against concurrent clients.
  can(state, command, { playerId = null, isHost = false, role = null, now = Date.now() } = {}) {
    const stage = this.stage(state, playerId, now);
    if (stage === 'finished' || stage === 'eliminated') return false;
    switch (command) {
      case 'START_DAY': return isHost && (stage === 'reveal' || stage === 'reveal.complete');
      case 'AUTO_START_DAY': return stage === 'dawn.complete';
      case 'AUTO_START_NIGHT': return stage === 'results.complete';
      case 'END_DISCUSSION': return isHost && stage === 'day.discussion';
      case 'OPEN_VOTING': {
        if (stage === 'day.voting') return true;
        if (stage !== 'day.discussion') return false;
        const deadline = Date.parse(state.phaseStartedAt || '') + (state.dayDurationSeconds ?? this.rules.discussionSeconds) * 1000;
        return Number.isFinite(deadline) && now >= deadline;
      }
      case 'CAST_DAY_VOTE': return stage === 'day.voting';
      case 'FINISH_DAY': return isHost && stage === 'day.voting';
      case 'CAST_NIGHT_VOTE': return stage === 'night' && this.roles.hasAction(role, 'kill');
      case 'CAST_DECOY_VOTE': return stage === 'night' && this.roles.hasAction(role, 'decoy');
      case 'CAST_SEER_INVESTIGATION': return stage === 'night' && this.roles.hasAction(role, 'inspect');
      default: return false;
    }
  }

  transition(state, command) {
    if (state.status !== 'playing') throw new Error('Game is not in progress.');
    if ((command.type === 'START_DAY' && state.phase === 'reveal')
      || (command.type === 'AUTO_START_DAY' && state.phase === 'dawn')) {
      return { phase: 'day', roundNumber: state.roundNumber };
    }
    if (command.type === 'AUTO_START_NIGHT' && state.phase === 'results') {
      return { phase: 'night', roundNumber: state.roundNumber };
    }
    throw new Error('Transition is not permitted from this state.');
  }
}
