import { StateEngine } from './state-engine.js';

const stateEngine = new StateEngine();

// Player-facing workflow guidance, derived only from visible game state.
export function workflowStatus(state, { role, playerId, isHost = false, pack = null, decoyPack = null, seerPack = null } = {}) {
  const round = state.roundNumber;
  const stage = stateEngine.stage(state, playerId);
  const waiting = (message, next) => ({ message, next });
  if (stage === 'lobby') return { label: 'LOBBY', title: 'Waiting for players', ...waiting(isHost ? 'Invite players, then start the game.' : 'Waiting for the host to start the game.', 'Secret roles are assigned') };
  if (stage === 'reveal' || stage === 'reveal.reveal') return { label: 'ROLE REVEAL', title: 'Discover your secret role', ...waiting(isHost ? 'Reveal your role, then start the first day.' : 'Reveal your role. Waiting for the host to begin.', 'Day 1 · Discussion') };
  if (stage.startsWith('day.')) {
    const active = state.players.filter(p => !p.eliminated_at);
    const votes = state.votes.filter(v => v.round_number === round);
    const mine = votes.some(v => v.voter_id === playerId);
    const voting = stage === 'day.voting';
    if (!voting) return { label: 'DAY ' + round + ' · DISCUSSION', title: 'Discuss your suspects', ...waiting('Talk with the village. No vote is needed yet.', 'Vote to banish a player') };
    return { label: 'DAY ' + round + ' · VOTING', title: mine ? 'Your vote is locked' : 'Choose a player to banish', ...waiting(mine ? 'Waiting for the remaining players.' : 'Cast your final vote.', 'Banishment result'), progress: votes.length + ' of ' + active.length + ' votes cast' };
  }
  if (stage === 'night') {
    if (role === 'seer') return {
      label: 'NIGHT ' + round + ' · SEER INVESTIGATION',
      title: seerPack?.myInvestigation ? 'Your investigation is complete' : 'Investigate a player',
      ...waiting(seerPack?.myInvestigation ? 'Waiting for the remaining night actions.' : 'Choose one living player. Your choice is final.', 'Dawn · Murder reveal')
    };
    if (role === 'werewolf') {
      const wolves = pack?.wolves || [];
      const votes = pack?.votes || [];
      const mine = votes.some(v => v.voter_id === playerId);
      return { label: 'NIGHT ' + round + ' · WEREWOLF VOTE', title: mine ? 'Reach agreement with your pack' : 'Choose your victim', ...waiting('All werewolves must agree on one target. You may change your nomination.', 'Dawn · Murder reveal'), progress: wolves.length ? votes.length + ' of ' + wolves.length + ' nominated' : null };
    }
    return { label: 'NIGHT ' + round + ' · VILLAGE QUESTION', title: decoyPack?.myVote ? 'Your answer is recorded' : 'Answer the night question', ...waiting(decoyPack?.myVote ? 'You can change your answer until dawn.' : 'Choose a player to answer the question.', 'Dawn · Murder reveal') };
  }
  if (stage === 'dawn.suspense' || stage === 'dawn.reveal') return { label: 'DAY ' + round + ' · DAWN', title: 'The night is over', ...waiting('Discover what happened overnight.', 'Discussion') };
  if (stage === 'results' || stage === 'results.reveal') return { label: 'DAY ' + round + ' · RESULT', title: 'A player has been banished', ...waiting(isHost ? 'Continue when everyone has seen the result.' : 'Waiting for the host to continue.', 'Night ' + round) };
  return null;
}
