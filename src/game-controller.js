import { GameState } from './game-state.js';
import { GameEngine, secureRandomInt } from './game-engine.js';
import { GameRepository } from './game-repository.js';
import { GameSync } from './game-sync.js';
import { Screens } from './screens.js';

const identityKey = id => 'werewolf:player:' + id;
const hostKey = id => 'werewolf:host:' + id;

export class GameController {
  constructor({
    repository = new GameRepository(),
    engine = new GameEngine(),
    screens = new Screens()
  } = {}) {
    this.repository = repository;
    this.engine = engine;
    this.screens = screens;
    this.sync = new GameSync(repository);
    this.state = new GameState();
    this.playerId = null;
    this.isHost = false;
    this.starting = false;
    this.advancing = false;
    this.refreshPending = false;
    this.refreshRunning = false;
    this.requestedGame = new URLSearchParams(location.search).get('game');
  }

  async init() {
    this.screens.nameInput.value = localStorage.getItem('werewolf:name') || '';
    this.screens.bind({
      onJoin: () => this.joinFromForm(),
      onWerewolves: delta => this.changeWerewolves(delta),
      onStart: () => this.startGame(),
      onAdvance: () => this.advancePhase()
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.state.id) this.requestRefresh();
    });
    if (!this.requestedGame) return;
    const savedId = localStorage.getItem(identityKey(this.requestedGame));
    if (savedId) {
      try {
        if (await this.repository.hasPlayer(this.requestedGame, savedId)) {
          await this.enterGame(this.requestedGame, savedId, localStorage.getItem(hostKey(this.requestedGame)) === 'true');
          return;
        }
      } catch (error) { this.screens.showError(error.message); }
    }
    document.querySelector('.entry label').textContent = 'Enter your name to join';
    this.screens.form.querySelector('button').textContent = 'Join Game →';
  }

  async joinFromForm() {
    const name = this.screens.nameInput.value.trim();
    const nameError = document.getElementById('name-error');
    if (!name) { nameError.hidden = false; this.screens.nameInput.focus(); return; }
    nameError.hidden = true;
    this.screens.showError('');
    const button = this.screens.form.querySelector('button');
    button.disabled = true;
    try {
      let gameId = this.requestedGame;
      const host = !gameId;
      if (gameId) {
        const game = await this.repository.getGame(gameId);
        if (!game || game.status !== 'lobby') throw new Error('This game is unavailable.');
      } else {
        gameId = await this.repository.createGame();
      }
      const playerId = localStorage.getItem(identityKey(gameId)) || crypto.randomUUID();
      await this.repository.joinGame(gameId, playerId, name);
      localStorage.setItem(identityKey(gameId), playerId);
      localStorage.setItem('werewolf:last-game', gameId);
      localStorage.setItem('werewolf:name', name);
      if (host) localStorage.setItem(hostKey(gameId), 'true');
      if (host) history.replaceState(null, '', location.pathname + '?game=' + gameId);
      await this.enterGame(gameId, playerId, host);
    } catch (error) {
      this.screens.showError(error.message || 'Could not connect to Supabase.');
    } finally { button.disabled = false; }
  }

  async enterGame(gameId, playerId, host) {
    this.playerId = playerId;
    this.isHost = host;
    this.state = new GameState({ id: gameId });
    const inviteUrl = new URL('?game=' + encodeURIComponent(gameId), location.href).href;
    this.screens.showLobby(gameId, host, inviteUrl);
    if (host) {
      try { await this.screens.renderQr(inviteUrl); }
      catch { this.screens.showError('Could not generate QR code. Use the invite link instead.'); }
    }
    // Listen before initial read, then resync on reconnect and when returning to the tab.
    await this.sync.subscribe(gameId, () => this.requestRefresh());
    this.requestRefresh();
  }

  requestRefresh() {
    this.refreshPending = true;
    if (!this.refreshRunning) void this.refresh();
  }

  async refresh() {
    if (this.refreshRunning) return;
    this.refreshRunning = true;
    try {
      while (this.refreshPending && this.state.id) {
        this.refreshPending = false;
        const id = this.state.id;
        const state = await this.repository.getState(id);
        if (id !== this.state.id) return;
        this.state = state;
        this.screens.renderLobby(state, this);
        if (state.status === 'playing') {
          const role = await this.repository.getMyRole(id, this.playerId);
          if (id === this.state.id) {
            this.state = this.state.with({ myRole: role });
            this.screens.showRole(this.state.myRole);
            this.screens.renderPhase(this.state, this);
          }
        }
      }
      this.screens.showError('');
    } catch (error) {
      this.screens.showError(error.message || 'Could not refresh the game.');
    } finally {
      this.refreshRunning = false;
      if (this.refreshPending) this.requestRefresh();
    }
  }

  async changeWerewolves(delta) {
    if (!this.isHost || this.starting || this.state.status !== 'lobby') return;
    const next = this.engine.nextWerewolfCount(this.state, delta);
    if (next === this.state.werewolfCount) return;
    try {
      await this.repository.setWerewolfCount(this.state.id, next);
      this.requestRefresh();
    } catch (error) { this.screens.showError(error.message); }
  }

  async advancePhase() {
    if (!this.isHost || this.advancing || this.state.status !== 'playing') return;
    this.advancing = true;
    this.screens.renderPhase(this.state, this);
    this.screens.showError('');
    try {
      const fresh = await this.repository.getState(this.state.id);
      const next = this.engine.nextPhase(fresh);
      await this.repository.advancePhase(fresh, next);
      this.requestRefresh();
    } catch (error) {
      this.screens.showError(error.message || 'Could not advance the game.');
      this.requestRefresh();
    } finally {
      this.advancing = false;
      this.screens.renderPhase(this.state, this);
    }
  }

  async startGame() {
    if (!this.isHost || this.starting || !this.engine.canStart(this.state)) return;
    this.starting = true;
    this.screens.renderLobby(this.state, this);
    this.screens.showError('');
    try {
      // Re-read just before assigning to avoid using a stale Realtime snapshot.
      const fresh = await this.repository.getState(this.state.id);
      if (!this.engine.canStart(fresh)) throw new Error('You need more players than werewolves.');
      const assignments = this.engine.assignRoles(fresh, secureRandomInt);
      await this.repository.startGame(fresh, assignments);
      this.requestRefresh();
    } catch (error) {
      this.screens.showError(error.message || 'Could not start the game.');
    } finally {
      this.starting = false;
      this.screens.renderLobby(this.state, this);
    }
  }
}
