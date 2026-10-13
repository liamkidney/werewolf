// Declarative game configuration. Assignments remain private server-side.
export const DEFAULT_RULES = Object.freeze({
  discussionSeconds: 120,
  roles: Object.freeze({
    villager: Object.freeze({
      label: 'Villager',
      description: 'You are a villager. Find the werewolves.',
      team: 'village',
      actions: Object.freeze(['decoy'])
    }),
    seer: Object.freeze({
      label: 'Seer',
      description: 'You are the Seer. Investigate one player each night. Keep your identity secret.',
      team: 'village',
      actions: Object.freeze(['inspect'])
    }),
    werewolf: Object.freeze({
      label: 'Werewolf',
      description: 'You are a werewolf. Keep your identity hidden.',
      team: 'werewolves',
      actions: Object.freeze(['kill'])
    })
  }),
  nightActions: Object.freeze({
    kill: Object.freeze({ role: 'werewolf', targetRole: 'village', consensus: 'unanimous', effect: 'eliminate' }),
    decoy: Object.freeze({ role: 'villager', targetRole: 'any', consensus: 'individual', effect: 'answer_question' }),
    inspect: Object.freeze({ role: 'seer', targetRole: 'any', consensus: 'individual', effect: 'reveal_team' })
  })
});
