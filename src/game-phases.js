// Shared phase metadata for rules and presentation.
export const PHASES = Object.freeze({
  reveal: { next: 'day', title: 'Roles assigned', description: 'Check your secret role. The host will start the first day when everyone is ready.', action: 'Start Day' },
  dawn: { next: 'day', title: 'Dawn breaks', description: 'The murder is revealed before discussion begins.', action: '' },
  night: { next: null, title: 'Night falls', description: 'Night actions resolve automatically when all required actions are complete.', action: '' },
  day: { next: 'voting', title: 'Day breaks', description: 'Discuss who should be banished.', action: 'Voting opens automatically' },
  voting: { next: 'results', title: 'Time to vote', description: 'Discuss your choice. In-app voting will be added in a future iteration.', action: 'Show results' },
  results: { next: 'night', title: 'Results', description: 'This round is complete. Vote resolution and eliminations are coming later.', action: 'Next night' }
});
