// Build URLs for six independent test frames and an optional standalone game.
// Keep this helper browser-independent for tests.
export function gameUrl({ gameId = null, playerId = null, isHost = false } = {}) {
  const params = new URLSearchParams();
  if (gameId) params.set('game', gameId);
  if (playerId) {
    if (!gameId) throw new Error('A test player requires a game ID.');
    params.set('test_player', playerId);
    params.set('test_host', isHost ? '1' : '0');
  }
  const search = params.toString();
  return './' + (search ? '?' + search : '');
}
