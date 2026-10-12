import { GameState } from './game-state.js';
import { GameEngine, secureRandomInt } from './game-engine.js';
import { GameRepository } from './game-repository.js';
import { GameSync } from './game-sync.js';
import { GameSession } from './game-session.js';
import { Screens } from './screens.js';
import { StateEngine } from './state-engine.js';

export class GameController {
  constructor({
    repository = new GameRepository(),
    engine = new GameEngine(),
    screens = new Screens()
  } = {}) {
    this.repository = repository;
    this.session = new GameSession();
    this.engine = engine;
    this.stateEngine = new StateEngine();
    this.screens = screens;
    this.sync = new GameSync(repository);
    this.state = new GameState();
    this.playerId = null;
    this.playerRole = null;
    this.isHost = false;
    this.wasHost = false;
    this.eliminated = false;
    this.starting = false;
    this.advancing = false;
    this.casting = false;
    this.nightCasting = false;
    this.nightPack = null;
    this.decoyPack = null;
    this.decoyCasting = false;
    this.endgameTimer = null;
    this.nightPoll = null;
    this.suspenseTimer = null;
    this.finishing = false;
    this.endingDiscussion = false;
    this.dayTicker = null;
    this.openingVoting = false;
    this.dayVotingOpen = false;
    this.dayVoteSignature = '';
    this.refreshPending = false;
    this.refreshRunning = false;
    this.requestedGame = this.session.requestedGame;
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
    this.screens.nameInput.value = this.session.name;
    this.screens.bind({
      onJoin: () => this.joinFromForm(),
      onWerewolves: delta => this.changeWerewolves(delta),
      onStart: () => this.startGame(),
      onAdvance: () => this.advancePhase(),
      onVote: target => this.castVote(target),
      onNightVote: target => this.castNightVote(target),
      onDecoyVote: target => this.castDecoyVote(target),
      onEndDiscussion: () => this.endDiscussion(),
      onFinishVoting: () => this.finishVoting(),
      onDismissBanishment: () => this.dismissBanishment()
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.state.id) this.requestRefresh();
    });
    if (this.requestedGame) {
      // Show join intent immediately, before any asynchronous game lookup.
      document.querySelector('.entry label').textContent = 'Enter your name to join';
      this.screens.form.querySelector('button').textContent = 'Join Game →';
      document.getElementById('resume-game').hidden = true;
    }
    if (!this.requestedGame) {
      const savedGame = this.session.activeGame;
      if (savedGame && !this.session.testFrame) {
        try {
          const playerId = this.session.playerId(savedGame);
          const [game, member] = await Promise.all([
            this.repository.getGame(savedGame),
            playerId ? this.repository.hasPlayer(savedGame, playerId) : Promise.resolve(false)
          ]);
          document.getElementById('resume-game').hidden = !game || !member;
          if (!game || !member) this.session.clearActive(savedGame);
        } catch (error) {
          this.screens.showConnectionError('Could not check the previous game. Try reloading.');
        }
      }
      return;
    }
    const savedId = this.session.testFrame ? null : this.session.playerId(this.requestedGame);
    if (savedId) {
      try {
        if (await this.repository.hasPlayer(this.requestedGame, savedId)) {
          await this.enterGame(this.requestedGame, savedId);
          return;
        }
      } catch (error) {
        this.showActionError(error.message || 'Could not restore your game.');
        return;
      }
    }
    const game = await this.repository.getGame(this.requestedGame);
    if (!game || game.status !== 'lobby') {
      this.requestedGame = null;
      this.showActionError('This game is unavailable or has already started. Return home to create a game.');
      this.screens.form.querySelector('button').disabled = true;
      return;
    }
  }

  async joinFromForm() {
    const name = this.screens.nameInput.value.trim();
    const nameError = document.getElementById('name-error');
    if (!name) { nameError.hidden = false; this.screens.nameInput.focus(); return; }
    nameError.hidden = true;
    this.showActionError('');
    const button = this.screens.form.querySelector('button');
    button.disabled = true;
    const originalLabel = button.innerHTML;
    button.textContent = 'Connecting…';
    try {
      let gameId = this.requestedGame;
      const host = !gameId;
      if (gameId) {
        const game = await this.repository.getGame(gameId);
        if (!game || game.status !== 'lobby') throw new Error('This game is unavailable.');
      } else {
        gameId = await this.repository.createGame();
      }
      const playerId = this.session.playerId(gameId) || crypto.randomUUID();
      await this.repository.joinGame(gameId, playerId, name);
      if (host) await this.repository.claimHost(gameId, playerId);
      this.session.savePlayer(gameId, playerId);
      this.session.name = name;
      await this.enterGame(gameId, playerId);
    } catch (error) {
      this.showActionError(error.message || 'Could not connect to Supabase.');
    } finally {
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  }

  async enterGame(gameId, playerId) {
    this.playerId = playerId;
    this.playerRole = null;
    this.eliminated = false;
    this.stopDayTimer();
    this.stopNightPoll();
    this.stopSuspenseTimer();
    if (this.endgameTimer !== null) clearTimeout(this.endgameTimer);
    this.endgameTimer = null;
    this.decoyPack = null;
    this.isHost = false;
    this.wasHost = false;
    this.state = new GameState({ id: gameId });
    const inviteUrl = this.session.invitation(gameId);
    if (!this.session.testFrame) {
      this.session.enter(gameId);
    }
    this.screens.showLobby(gameId, false, inviteUrl);
    // The database determines who the host is; never restore authority from storage.
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
        if (!state.players.some(player => player.id === this.playerId)) {
          this.screens.showConnectionError('Your player membership could not be found.');
          return;
        }
        if (this.eliminated && state.status !== 'finished') return;
        if (state.status === 'finished' && !this.session.testFrame && this.session.activeGame === id) {
          this.session.clearActive(id);
        }
        if (state.status === 'finished') {
          this.state = state;
          this.isHost = state.hostPlayerId === this.playerId;
          this.decoyPack = state.phase === 'dawn' ? await this.repository.getDecoyPack(id, this.playerId) : null;
          this.renderFinished(state);
          return;
        }
        if (state.players.some(player => player.id === this.playerId && player.eliminated_at)) {
          if (state.lastMurderedId === this.playerId && this.suspenseRemaining(state) > 0) {
            this.state = state;
            this.showSuspense(state);
            return;
          }
          const murdered = state.lastMurderedId === this.playerId && state.lastMurderedRound === state.roundNumber;
          const successor = this.wasHost && state.hostPlayerId !== this.playerId
            ? state.players.find(player => player.id === state.hostPlayerId)?.name : null;
          this.screens.showEliminated(murdered, successor);
          this.eliminated = true;
          this.refreshPending = false;
          this.stopDayTimer();
          this.stopNightPoll();
          this.stopSuspenseTimer();
          // Keep the subscription so eliminated players can see the final result.
          return;
        }
        if (state.status === 'playing' && !this.playerRole) {
          this.playerRole = await this.repository.getMyRole(id, this.playerId);
        }
        if (id !== this.state.id || this.eliminated) return;
        this.state = state;
        if (state.phase === 'night' && this.playerRole === 'werewolf') this.nightPack = await this.repository.getNightPack(id, this.playerId);
        if (state.phase === 'night' && this.playerRole === 'villager') this.decoyPack = await this.repository.getDecoyPack(id, this.playerId);
        if (state.phase === 'dawn') this.decoyPack = await this.repository.getDecoyPack(id, this.playerId);
        const previousHost = this.isHost;
        this.isHost = state.hostPlayerId === this.playerId;
        if (this.isHost && !previousHost && state.status === 'lobby') {
          this.screens.showLobby(id, true, this.session.invitation(id));
          void this.screens.renderQr(this.session.invitation(id)).catch(() => this.showActionError('Could not generate QR code. Use the invite link instead.'));
        }
        if (this.isHost) this.wasHost = true;
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

  suspenseRemaining(state) {
    if (state.phase !== 'dawn') return 0;
    const started = Date.parse(state.phaseStartedAt || '');
    return Number.isFinite(started) ? Math.max(0, started + 6000 - Date.now()) : 0;
  }

  stopSuspenseTimer() {
    if (this.suspenseTimer !== null) clearTimeout(this.suspenseTimer);
    this.suspenseTimer = null;
  }

  showSuspense(state) {
    this.screens.renderSuspense();
    if (this.suspenseTimer !== null) return;
    this.suspenseTimer = setTimeout(() => {
      this.suspenseTimer = null;
      this.requestRefresh();
    }, this.suspenseRemaining(state) + 30);
  }

  renderFinished(state) {
    this.stopNightPoll();
    this.stopDayTimer();
    if (this.endgameTimer !== null) clearTimeout(this.endgameTimer);
    this.endgameTimer = null;
    const started = Date.parse(state.phaseStartedAt || '');
    const revealDuration = state.phase === 'dawn' ? 10000 : 4000;
    const remaining = Number.isFinite(started) ? Math.max(0, started + revealDuration - Date.now()) : 0;
    if (remaining > 0) {
      if (state.phase === 'dawn') {
        if (this.suspenseRemaining(state) > 0) this.showSuspense(state);
        else {
          const victim = state.players.find(player => player.id === state.lastMurderedId);
          if (victim?.id === this.playerId) this.screens.showEliminated(true, this.wasHost ? state.players.find(p => p.id === state.hostPlayerId)?.name : null);
          else this.screens.renderMurderReveal(victim?.name || 'A villager', false, state.decoyQuestion, this.decoyPack?.results || [], state.players);
        }
      } else {
        const banished = state.players.find(player => player.id === state.lastBanishedId);
        if (banished?.id === this.playerId) this.screens.showEliminated(false, this.wasHost ? state.players.find(p => p.id === state.hostPlayerId)?.name : null);
        else this.screens.renderBanishment(banished?.name || 'A player', false, false);
      }
      this.endgameTimer = setTimeout(() => { this.endgameTimer = null; this.requestRefresh(); }, remaining + 30);
      return;
    }
    this.stopSuspenseTimer();
    void this.repository.getFinalRoles(state.id).then(roles => {
      if (this.state.id === state.id && this.state.status === 'finished') this.screens.renderEndgame(state.winner, roles);
    }).catch(error => this.showActionError(error.message || 'Could not load final roles.'));
  }

  async castDecoyVote(targetId) {
    if (this.eliminated || this.decoyCasting || this.playerRole !== 'villager' || this.state.phase !== 'night' || !targetId) return;
    this.decoyCasting = true;
    try {
      await this.repository.castDecoyVote(this.state.id, this.state.roundNumber, this.playerId, targetId);
      this.requestRefresh();
    } catch (error) {
      this.showActionError(error.message || 'Could not record your answer.');
    } finally {
      this.decoyCasting = false;
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
    if (state.phase !== 'dawn') this.stopSuspenseTimer();
    if (state.status !== 'playing') {
      this.renderLobby();
      return;
    }
    if (state.phase === 'night') {
      this.screens.renderNight(state, { playerId: this.playerId, role: this.playerRole, pack: this.nightPack, casting: this.nightCasting || this.decoyCasting, decoyPack: this.decoyPack });
      if (this.nightPoll === null) this.nightPoll = setInterval(() => this.requestRefresh(), 1500);
      return;
    }
    if (state.phase === 'dawn') {
      if (this.suspenseRemaining(state) > 0) {
        this.showSuspense(state);
        return;
      }
      this.stopSuspenseTimer();
      const victim = state.players.find(player => player.id === state.lastMurderedId);
      this.screens.renderMurderReveal(victim?.name || 'A villager', this.isHost, state.decoyQuestion, this.decoyPack?.results || [], state.players);
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
    if (seconds === 0 && state.step === 'discussion' && !this.openingVoting) void this.openDayVoting();
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

  async openDayVoting() {
    if (this.openingVoting || this.eliminated || this.state.phase !== 'day') return;
    this.openingVoting = true;
    try {
      await this.repository.openDayVoting(this.state.id, this.state.roundNumber);
      this.requestRefresh();
    } catch (error) {
      this.screens.showConnectionError(error.message || 'Could not open voting.');
    } finally {
      this.openingVoting = false;
    }
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
    if (this.eliminated || !this.isHost || this.advancing || this.state.status !== 'playing' || this.state.phase === 'night' || this.suspenseRemaining(this.state) > 0) return;
    this.advancing = true;
    this.screens.renderPhase(this.state, this);
    this.showActionError('');
    try {
      const fresh = await this.repository.getState(this.state.id);
      const next = this.stateEngine.transition(fresh, { type: fresh.phase === 'reveal' || fresh.phase === 'dawn' ? 'START_DAY' : 'START_NIGHT' });
      await this.repository.advancePhase(fresh, next, this.playerId);
      this.requestRefresh();
    } catch (error) {
      this.showActionError(error.message || 'Could not advance the game.');
      this.requestRefresh();
    } finally {
      this.advancing = false;
      if (this.state.status === 'playing' && this.state.phase === 'reveal') this.screens.renderPhase(this.state, this);
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
