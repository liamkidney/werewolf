import { GameController } from './src/game-controller.js';

const game = new GameController();
void game.init().catch(error => game.screens.showError(error.message || 'Could not initialise the game.'));
