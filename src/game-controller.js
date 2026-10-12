import { GameState } from './game-state.js';
import { GameEngine, secureRandomInt } from './game-engine.js';
import { GameRepository } from './game-repository.js';
import { GameSync } from './game-sync.js';
import { Screens } from './screens.js';
import { StateEngine } from './state-engine.js';

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
    this.stateEngine = new StateEngine();
    this.screens = screens;
    this.sync = new GameSync(repository);
    this.state = new GameState();
    this.playerId = null;
    this.playerRole = null;
    this.isHost = false;
    this.eliminated = false;
    this.starting = false;
    this.advancing = false;
    this.casting = false;
    this.nightCasting = false;
    this.nightPack = null;
    this.nightPoll = null;
    this.finishing = false;
    this.endingDiscussion = false;
    this.dayTicker = null;
    this.dayVotingOpen = false;
    this.dayVoteSignature = '';
    this.refreshPending = false;
    this.refreshRunning = false;
    this.requestedGame = new URLSearchParams(location.search).get('game');
  }

  renderLobby() {
    this.screens.renderLobby(this.state, {
      isHost: this.isHost,
      playerId: this.playerId,
      starting: this.starting,
      canStart: this.engine.canStart(this.state)
    });
  }

  showActionError(message) {
    this.screens.showError(message);
  }

  async init() {
    this.screens.nameInput.value = localStorage.getItem('werewolf:name') || '';
    this.screens.bind({
      onJoin: () => this.joinFromForm(),
      onWerewolves: delta => this.changeWerewolves(delta),
      onStart: () => this.startGame(),
      onAdvance: () => this.advancePhase(),
      onVote: target => this.castVote(target),
      onNightVote: target => this.castNightVote(target),
      onEndDiscussion: () => this.endDiscussion(),
      onFinishVoting: () => this.finishVoting(),
      onDismissBanishment: () => this.dismissBanishment()
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.state.id && !this.eliminated) this.requestRefresh();
    });
    if (!this.requestedGame) return;
    const savedId = localStorage.getItem(identityKey(this.requestedGame));
    if (savedId) {
      try {
        if (await this.repository.hasPlayer(this.requestedGame, savedId)) {
          await this.enterGame(this.requestedGame, savedId, localStorage.getItem(hostKey(this.requestedGame)) === 'true');
          return;
        }
      } catch (error) { this.showActionError(error.message); }
    }
    document.querySelector('.entry label').textContent = 'Enter your name to join';
    this.screens.form.querySelector('button').textContent = 'Join Game →';
  }

  async joinFromForm() {
    const name = this.screens.nameInput.value.trim();
    const nameError = document.getElementById('name-error');
    if (!name) { nameError.hidden = false; this.screens.nameInput.focus(); return; }
    nameError.hidden = true;
    this.showActionError('');
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
      if (host) await this.repository.claimHost(gameId, playerId);
      localStorage.setItem(identityKey(gameId), playerId);
      localStorage.setItem('werewolf:name', name);
      if (host) localStorage.setItem(hostKey(gameId), 'true');
      if (host) history.replaceState(null, '', location.pathname + '?game=' + gameId);
      await this.enterGame(gameId, playerId, host);
    } catch (error) {
      this.showActionError(error.message || 'Could not connect to Supabase.');
    } finally { button.disabled = false; }
  }

  async enterGame(gameId, playerId, host) {
    this.playerId = playerId;
    this.playerRole = null;
    this.eliminated = false;
    this.stopDayTimer();
    this.stopNightPoll();
    this.isHost = host;
    this.state = new GameState({ id: gameId });
    const inviteUrl = new URL('?game=' + encodeURIComponent(gameId), location.href).href;
    this.screens.showLobby(gameId, host, inviteUrl);
    if (host) {
      try { await this.screens.renderQr(inviteUrl); }
      catch { this.showActionError('Could not generate QR code. Use the invite link instead.'); }
    }
    // Listen before initial read, then resync on reconnect and when returning to the tab.
    await this.sync.subscribe(gameId, () => this.requestRefresh());
    this.requestRefresh();
  }

  requestRefresh() {
    if (this.eliminated) return;
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
        if (id !== this.state.id || this.eliminated) return;
        if (state.players.some(player => player.id === this.playerId && player.eliminated_at)) {
          this.eliminated = true;
          this.refreshPending = false;
          this.stopDayTimer();
          this.stopNightPoll();
          this.screens.showEliminated();
          void this.sync.stop();
          return;
        }
        if (state.status === 'playing' && !this.playerRole) {
          this.playerRole = await this.repository.getMyRole(id, this.playerId);
        }
        if (id !== this.state.id || this.eliminated) return;
        this.state = state;
        if (state.phase === 'night' && this.playerRole === 'werewolf') this.nightPack = await this.repository.getNightPack(id, this.playerId);
        if (state.hostPlayerId) this.isHost = state.hostPlayerId === this.playerId;
        this.renderCurrentScreen();
      }
      this.screens.showConnectionError('');
    } catch (error) {
      this.screens.showConnectionError(error.message || 'Could not refresh the game.');
    } finally {
      this.refreshRunning = false;
      if (this.refreshPending) this.requestRefresh();
    }
  }

  stopNightPoll() {
    if (this.nightPoll !== null) clearInterval(this.nightPoll);
    this.nightPoll = null;
  }

  async castNightVote(targetId) {
    if (this.eliminated || this.nightCasting || this.playerRole !== 'werewolf' || this.state.phase !== 'night' || !targetId) return;
    this.nightCasting = true;
    this.showActionError('');
    try {
      await this.repository.castNightVote(this.state.id, this.state.roundNumber, this.playerId, targetId);
      this.requestRefresh();
    } catch (error) {
      this.showActionError(error.message || 'Could not nominate a villager.');
    } finally {
      this.nightCasting = false;
      if (this.state.phase === 'night') this.requestRefresh();
    }
  }

  stopDayTimer() {
    if (this.dayTicker !== null) clearInterval(this.dayTicker);
    this.dayTicker = null;
  }

  renderCurrentScreen() {
    const state = this.state;
    if (this.eliminated) return;
    this.stopDayTimer();
    if (state.phase !== 'night') this.stopNightPoll();
    if (state.status !== 'playing') {
      this.renderLobby();
      return;
    }
    if (state.phase === 'night') {
      this.screens.renderNight(state, { playerId: this.playerId, role: this.playerRole, pack: this.nightPack, casting: this.nightCasting });
      if (this.nightPoll === null) this.nightPoll = setInterval(() => this.requestRefresh(), 1500);
      return;
    }
    if (state.phase === 'day') {
      this.renderDay();
      this.dayTicker = setInterval(() => this.renderDay(), 250);
      return;
    }
    const banished = state.players.find(player => player.id === state.lastBanishedId);
    if (state.phase === 'results' && banished && state.lastBanishedRound === state.roundNumber) {
      this.screens.renderBanishment(banished.name, banished.id === this.playerId, this.isHost);
      return;
    }
    const eliminated = state.players.some(player => player.id === this.playerId && !!player.eliminated_at);
    this.screens.showRole(eliminated ? null : this.playerRole);
    if (eliminated) this.screens.showSpectator();
    this.screens.renderPhase(state, this);
  }

  renderDay() {
    if (this.eliminated) return;
    const state = this.state;
    if (state.phase !== 'day') { this.stopDayTimer(); return; }
    const deadline = Date.parse(state.phaseStartedAt || '') + (state.dayDurationSeconds ?? 120) * 1000;
    const seconds = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : (state.dayDurationSeconds ?? 120);
    const voting = this.stateEngine.step(state) === 'voting';
    const active = state.players.filter(player => !player.eliminated_at);
    const votes = state.votes.filter(vote => vote.round_number === state.roundNumber);
    const myVote = votes.find(vote => vote.voter_id === this.playerId);
    if (voting && votes.length === active.length) {
      this.stopDayTimer();
      const target = state.players.find(player => player.id === myVote?.target_id);
      this.screens.renderMarquee(target?.name || (this.isHost ? 'Votes in' : 'Spectating'), this.isHost, this.finishing);
      return;
    }
    // Avoid rebuilding the select list on every clock tick.
    const signature = state.roundNumber + ':' + votes.length + ':' + Boolean(myVote);
    if (this.dayVotingOpen !== voting || this.dayVoteSignature !== signature || document.getElementById('day-screen').hidden) {
      this.screens.renderDay(state, { playerId: this.playerId, isHost: this.isHost, voting, myVote, casting: this.casting, endingDiscussion: this.endingDiscussion });
      this.dayVotingOpen = voting;
      this.dayVoteSignature = signature;
    }
    if (!voting) this.screens.updateClock(seconds);
    document.getElementById('vote-progress').textContent = voting
      ? myVote ? 'Vote locked. Waiting for everyone… ' + votes.length + '/' + active.length
        : 'Votes cast: ' + votes.length + '/' + active.length
      : '';
  }

  async endDiscussion() {
    if (this.eliminated || !this.isHost || this.endingDiscussion || this.state.phase !== 'day' || this.state.discussionEndedAt) return;
    this.endingDiscussion = true;
    this.showActionError('');
    try {
      await this.repository.endDiscussion(this.state.id, this.playerId);
      this.requestRefresh();
    } catch (error) {
      this.showActionError(error.message || 'Could not end discussion.');
    } finally {
      this.endingDiscussion = false;
    }
  }

  async castVote(targetId) {
    if (this.eliminated || this.casting || !targetId || targetId === this.playerId || this.state.phase !== 'day') return;
    this.casting = true;
    this.showActionError('');
    try {
      await this.repository.castVote(this.state.id, this.state.roundNumber, this.playerId, targetId);
      this.requestRefresh();
    } catch (error) {
      this.showActionError(error.message || 'Could not cast vote.');
    } finally {
      this.casting = false;
    }
  }

  async finishVoting() {
    if (this.eliminated || !this.isHost || this.finishing || this.state.phase !== 'day') return;
    this.finishing = true;
    this.screens.renderMarquee(
      this.state.players.find(player => player.id === this.state.votes.find(vote =>
        vote.voter_id === this.playerId && vote.round_number === this.state.roundNumber)?.target_id)?.name || '',
      true, true
    );
    try {
      await this.repository.finishDay(this.state.id, this.state.roundNumber);
      this.requestRefresh();
    } catch (error) {
      this.showActionError(error.message || 'Could not complete voting.');
    } finally {
      this.finishing = false;
    }
  }

  async dismissBanishment() {
    if (this.eliminated || !this.isHost || this.advancing || this.state.phase !== 'results') return;
    await this.advancePhase();
  }

  async changeWerewolves(delta) {
    if (this.eliminated || !this.isHost || this.starting || this.state.status !== 'lobby') return;
    const next = this.engine.nextWerewolfCount(this.state, delta);
    if (next === this.state.werewolfCount) return;
    try {
      await this.repository.setWerewolfCount(this.state.id, next);
      this.requestRefresh();
    } catch (error) { this.showActionError(error.message); }
  }

  async advancePhase() {
    if (this.eliminated || !this.isHost || this.advancing || this.state.status !== 'playing' || this.state.phase === 'night') return;
    this.advancing = true;
    this.screens.renderPhase(this.state, this);
    this.showActionError('');
    try {
      const fresh = await this.repository.getState(this.state.id);
      const next = this.stateEngine.transition(fresh, { type: fresh.phase === 'reveal' ? 'START_DAY' : 'START_NIGHT' });
      await this.repository.advancePhase(fresh, next);
      this.requestRefresh();
    } catch (error) {
      this.showActionError(error.message || 'Could not advance the game.');
      this.requestRefresh();
    } finally {
      this.advancing = false;
      this.screens.renderPhase(this.state, this);
    }
  }

  async startGame() {
    if (this.eliminated || !this.isHost || this.starting || !this.engine.canStart(this.state)) return;
    this.starting = true;
    this.renderLobby();
    this.showActionError('');
    try {
      // Re-read just before assigning to avoid using a stale Realtime snapshot.
      const fresh = await this.repository.getState(this.state.id);
      if (!this.engine.canStart(fresh)) throw new Error('You need more players than werewolves.');
      const assignments = this.engine.assignRoles(fresh, secureRandomInt);
      await this.repository.startGame(fresh, assignments);
      this.requestRefresh();
    } catch (error) {
      this.showActionError(error.message || 'Could not start the game.');
    } finally {
      this.starting = false;
      this.renderLobby();
    }
  }
}
