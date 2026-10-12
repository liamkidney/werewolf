// Declarative rule configuration. New roles add actions, not new game phases.
export const DEFAULT_RULES = Object.freeze({
  discussionSeconds: 120,
  roles: Object.freeze({
    villager: { team: 'village', actions: [] },
    werewolf: { team: 'werewolves', actions: ['kill'] }
  }),
  nightActions: Object.freeze({
    kill: { role: 'werewolf', targetRole: 'villager', consensus: 'unanimous', effect: 'eliminate' }
  })
});
