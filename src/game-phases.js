// Shared phase metadata for rules and presentation.
export const PHASES = Object.freeze({
  reveal: { next: 'night', title: 'Roles assigned', description: 'Check your secret role. The host will begin the first night.', action: 'Begin night' },
  night: { next: 'day', title: 'Night falls', description: 'Everyone closes their eyes. Night actions will be added in a future iteration.', action: 'Begin day' },
  day: { next: 'voting', title: 'Day breaks', description: 'Discuss who should be banished.', action: 'Voting opens automatically' },
  voting: { next: 'results', title: 'Time to vote', description: 'Discuss your choice. In-app voting will be added in a future iteration.', action: 'Show results' },
  results: { next: 'night', title: 'Results', description: 'This round is complete. Vote resolution and eliminations are coming later.', action: 'Next night' }
});
