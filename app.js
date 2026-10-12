import { GameController } from './src/game-controller.js?v=20261012d';

const game = new GameController();
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
