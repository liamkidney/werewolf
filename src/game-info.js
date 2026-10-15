// Public game summary; individual player roles are never included.
export function getGameInfo(state) {
  const players = state.players ?? [];
  const wolves = state.werewolfCount ?? 0;
  const seers = state.seerCount ?? 0;
  const eliminated = reason => players
    .filter(player => player.eliminated_at && player.elimination_reason === reason)
    .map(player => player.name)
    .sort((a, b) => a.localeCompare(b));
  return {
    total: players.length,
    roles: [
      { role: 'villager', count: Math.max(0, players.length - wolves - seers) },
      { role: 'seer', count: seers },
      { role: 'werewolf', count: wolves }
    ],
    banished: eliminated('banished'),
    murdered: eliminated('murdered')
  };
}
