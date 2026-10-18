import { StateEngine } from './state-engine.js';

const stateEngine = new StateEngine();

// Player-facing workflow guidance, derived only from visible game state.
export function workflowStatus(state, { role, playerId, isHost = false, pack = null, decoyPack = null, seerPack = null, bodyguardPack = null } = {}) {
  const round = state.roundNumber;
  const stage = stateEngine.stage(state, playerId);
  const waiting = (message, next) => ({ message, next });
  if (stage === 'lobby') return { label: 'LOBBY', title: 'Waiting for players', ...waiting(isHost ? 'Invite players, then start the game.' : 'Waiting for the host to start the game.', 'Secret roles are assigned') };
  if (stage === 'reveal' || stage === 'reveal.reveal') return { label: 'ROLE REVEAL', title: 'Discover your secret role', ...waiting(isHost ? 'Reveal your role, then start the first day.' : 'Reveal your role. Waiting for the host to begin.', 'Day 1 · Discussion') };
  if (stage.startsWith('day.')) {
    const active = state.players.filter(p => !p.eliminated_at);
    const runoff = state.runoffEnabled && state.voteStage === 'runoff';
    const votes = (runoff ? state.runoffVotes : state.votes).filter(v => v.round_number === round);
    const mine = votes.some(v => v.voter_id === playerId);
    const voting = stage === 'day.voting';
    if (!voting) return { label: 'DAY ' + round + ' · DISCUSSION', title: 'Discuss your suspects', ...waiting('Talk with the village. No vote is needed yet.', 'Vote to banish a player') };
    if (runoff) return {
      label: 'DAY ' + round + ' · RUNOFF', title: mine ? 'Your runoff vote is locked' : 'Break the tie',
      ...waiting(mine ? 'Waiting for the remaining runoff votes.' : 'Vote for one of the tied candidates.', 'Banishment decision'),
      progress: votes.length + ' of ' + active.length + ' runoff votes cast'
    };
    return { label: 'DAY ' + round + ' · VOTING', title: mine ? 'Your vote is locked' : 'Choose a player to banish', ...waiting(mine ? 'Waiting for the remaining players.' : 'Cast your final vote.', 'Banishment result'), progress: votes.length + ' of ' + active.length + ' votes cast' };
  }
  if (stage === 'night') {
    if (role === 'bodyguard') return {
      label: 'NIGHT ' + round + ' · BODYGUARD',
      title: bodyguardPack?.myProtection ? 'Your protection is recorded' : 'Protect a player',
      ...waiting(bodyguardPack?.myProtection
        ? 'You can change your choice until the night ends.'
        : 'Choose one living player, including yourself. Not the same as last night.', 'Dawn')
    };
    if (role === 'seer') return {
      label: 'NIGHT ' + round + ' · SEER INVESTIGATION',
      title: seerPack?.myInvestigation ? 'Your investigation is complete' : 'Investigate a player',
      ...waiting(seerPack?.myInvestigation ? 'Waiting for the remaining night actions.' : 'Choose one living player. Your choice is final.', 'Dawn · Night outcome')
    };
    if (role === 'werewolf') {
      const wolves = pack?.wolves || [];
      const votes = pack?.votes || [];
      const mine = votes.some(v => v.voter_id === playerId);
      if (wolves.length === 1) return {
        label: 'NIGHT ' + round + ' · WEREWOLF',
        title: mine ? 'Your victim is selected' : 'Choose your victim',
        ...waiting(mine ? 'Waiting for the remaining night actions.' : 'Choose one living villager to eliminate.', 'Dawn · Night outcome')
      };
      return { label: 'NIGHT ' + round + ' · WEREWOLF VOTE', title: mine ? 'Reach agreement with your pack' : 'Choose your victim', ...waiting('All werewolves must agree on one target. You may change your nomination.', 'Dawn · Night outcome'), progress: wolves.length ? votes.length + ' of ' + wolves.length + ' nominated' : null };
    }
    return { label: 'NIGHT ' + round + ' · VILLAGE QUESTION', title: decoyPack?.myVote ? 'Your answer is recorded' : 'Answer the night question', ...waiting(decoyPack?.myVote ? 'You can change your answer until dawn.' : 'Choose a player to answer the question.', 'Dawn · Night outcome') };
  }
  if (stage === 'dawn.suspense' || stage === 'dawn.reveal' || stage === 'dawn.complete') return { label: 'DAY ' + round + ' · DAWN', title: 'The night is over', ...waiting('Discover what happened overnight.', 'Discussion') };
  if (stage === 'results.reveal' || stage === 'results.complete') return {
    label: 'DAY ' + round + ' · BANISHMENT',
    title: state.lastBanishedId ? 'A player has been banished' : 'Nobody was banished',
    ...waiting('The result is being revealed.', 'Night ' + round)
  };
  return null;
}
