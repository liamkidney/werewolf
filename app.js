import { GameController } from './src/game-controller.js';
import { GameRepository } from './src/game-repository.js';
import { supabaseClient } from './src/supabase-client.js';

const game = new GameController({
  repository: new GameRepository(supabaseClient)
});
const params = new URLSearchParams(location.search);
const testPlayer = params.get('test_player');
const testHost = params.get('test_host') === '1';
const isDev = location.pathname.includes('/dev/') || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

if (testPlayer && isDev && params.get('game')) {
  // Test-console frames use their explicit identities, never shared localStorage.
  void game.init().then(() => game.enterGame(params.get('game'), testPlayer))
    .catch(error => game.screens.showError(error.message || 'Could not join test game.'));
} else {
  void game.init().catch(error => game.screens.showError(error.message || 'Could not initialise the game.'));
}
