// Declarative rule configuration. New roles add actions, not new game phases.
export const DEFAULT_RULES = Object.freeze({
  discussionSeconds: 120,
  roles: Object.freeze({
    villager: { team: 'village', actions: [] },
    seer: { team: 'village', actions: ['inspect'] },
    werewolf: { team: 'werewolves', actions: ['kill'] }
  }),
  nightActions: Object.freeze({
    kill: { role: 'werewolf', targetRole: 'village', consensus: 'unanimous', effect: 'eliminate' },
    inspect: { role: 'seer', targetRole: 'any', consensus: 'individual', effect: 'reveal_team' }
  })
});
