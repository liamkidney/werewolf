// Public game summary. Use only roles explicitly published by the banishment
// rules; never use a player's private role assignment.
const PUBLIC_ROLES = new Set(['villager', 'seer', 'werewolf']);

export function getGameInfo(state) {
  const players = state.players ?? [];
  const wolves = state.werewolfCount ?? 0;
  const seers = state.seerCount ?? 0;
  const eliminated = reason => players
    .filter(player => player.eliminated_at && player.elimination_reason === reason)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    total: players.length,
    roles: [
      { role: 'villager', count: Math.max(0, players.length - wolves - seers) },
      { role: 'seer', count: seers },
      { role: 'werewolf', count: wolves }
    ],
    banished: eliminated('banished').map(player => {
      const role = player.revealed_banished_role;
      return state.revealBanishedRole === true && PUBLIC_ROLES.has(role)
        ? player.name + ' - ' + role : player.name;
    }),
    murdered: eliminated('murdered').map(player => player.name)
  };
}
