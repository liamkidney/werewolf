import { EDITION_PRIDE } from './edition.js';

// All six test frames and the optional standalone game link must agree
// on the selected edition. Keep this helper browser-independent for tests.
export function gameUrl({ gameId = null, edition = 'classic', playerId = null, isHost = false } = {}) {
  const params = new URLSearchParams();
  if (gameId) params.set('game', gameId);
  if (edition === EDITION_PRIDE) params.set('theme', EDITION_PRIDE);
  if (playerId) {
    if (!gameId) throw new Error('A test player requires a game ID.');
    params.set('test_player', playerId);
    params.set('test_host', isHost ? '1' : '0');
  }
  const search = params.toString();
  return './' + (search ? '?' + search : '');
}
