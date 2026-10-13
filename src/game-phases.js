// Shared phase metadata for rules and presentation.
export const PHASES = Object.freeze({
  reveal: { next: 'day', title: 'Roles assigned', description: 'Check your secret role. The host will start the first day when everyone is ready.', action: 'Start Day' },
  dawn: { next: 'day', title: 'Dawn breaks', description: 'The murder is revealed before discussion begins.', action: '' },
  night: { next: null, title: 'Night falls', description: 'Night actions resolve automatically when all required actions are complete.', action: '' },
  day: { next: 'voting', title: 'Day breaks', description: 'Discuss who should be banished.', action: 'Voting opens automatically' },
  results: { next: 'night', title: 'Banishment result', description: 'The village learns who was banished before night begins automatically.', action: '' }
});
