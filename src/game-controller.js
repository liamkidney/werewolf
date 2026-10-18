import { GameState } from './game-state.js';
import { GameEngine, secureRandomInt } from './game-engine.js';
import { GameSync } from './game-sync.js';
import { GameSession } from './game-session.js';
import { Screens } from './screens.js';
import { StateEngine } from './state-engine.js';
import { PhaseAdvancer } from './phase-advancer.js';
import { PresentationController } from './presentation-controller.js';

export class GameController {
  constructor({
    repository,
    engine = new GameEngine(),
    screens = new Screens()
  } = {}) {
    if (!repository) throw new Error('A game repository must be provided to GameController.');
    this.repository = repository;
    this.session = new GameSession();
    this.engine = engine;
    this.stateEngine = new StateEngine();
    this.screens = screens;
    this.sync = new GameSync(repository);
    this.state = new GameState();
    this.playerId = null;
    this.playerRole = null;
    this.werewolfPackmates = null;
    this.isHost = false;
    this.wasHost = false;
    this.eliminated = false;
    this.staleSession = false;
    this.recoverySaving = false;
    this.starting = false;
    this.revealBanishedRoleSaving = false;
    this.pendingBanishedRoleReveal = null;
    this.advancing = false;
    this.casting = false;
    this.nightCasting = false;
    this.nightPack = null;
    this.decoyPack = null;
    this.decoyCasting = false;
    this.seerPack = null;
    this.seerCasting = false;
    this.finalCreditsGameId = null;
    this.nightPoll = null;
    this.finishing = false;
    this.endingDiscussion = false;
    this.dayTicker = null;
    this.openingVoting = false;
    this.dayVotingOpen = false;
    this.dayVoteSignature = '';
    this.refreshPending = false;
    this.refreshRunning = false;
    this.presentations = new PresentationController({
      stateEngine: this.stateEngine,
      requestRefresh: () => this.requestRefresh()
    });
    this.phaseAdvancer = new PhaseAdvancer({
      repository: this.repository,
      getState: () => this.state,
      can: command => this.can(command),
      requestRefresh: () => this.requestRefresh(),
      reportError: message => this.screens.showConnectionError(message)
    });
    this.requestedGame = this.session.requestedGame;
  }

  can(command) {
    return !this.staleSession && this.stateEngine.can(this.state, command, {
      playerId: this.playerId, isHost: this.isHost, role: this.playerRole
    });
  }

  renderLobby() {
    this.screens.renderWorkflow(this.state, { playerId: this.playerId, isHost: this.isHost });
    const displayState = this.pendingBanishedRoleReveal === null
      ? this.state : this.state.with({ revealBanishedRole: this.pendingBanishedRoleReveal });
    this.screens.renderLobby(displayState, {
      isHost: this.isHost,
      playerId: this.playerId,
      starting: this.starting,
      savingReveal: this.revealBanishedRoleSaving,
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
      onSeers: delta => this.changeSeers(delta),
      onRevealBanishedRole: enabled => this.changeRevealBanishedRole(enabled),
      onStart: () => this.startGame(),
      onAdvance: () => this.advancePhase(),
      onVote: target => this.castVote(target),
      onNightVote: target => this.castNightVote(target),
      onSeerInvestigation: target => this.castSeerInvestigation(target),
      onDecoyVote: target => this.castDecoyVote(target),
      onEndDiscussion: () => this.endDiscussion(),
      onFinishVoting: () => this.finishVoting(),
      onOpenRecovery: () => this.openRecovery(),
      onIssueRecovery: targetId => this.issueRecovery(targetId)
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.state.id) this.requestRefresh();
    });
    if (this.session.recoveryToken && !this.session.testFrame) {
      // Recovery is independent of the old browser's localStorage, and
      // works for hosts as well as ordinary players.
      try {
        const recovered = await this.repository.redeemRejoinTicket(this.session.recoveryToken);
        if (!recovered?.game_id || !recovered?.player_id
          || !Number.isSafeInteger(recovered.session_generation)) {
          throw new Error('Invalid recovery response.');
        }
        this.session.savePlayer(recovered.game_id, recovered.player_id, recovered.session_generation);
        this.session.name = recovered.name;
        await this.enterGame(recovered.game_id, recovered.player_id);
      } catch (error) {
        this.session.clearRecoveryUrl();
        this.showActionError('This rejoin QR code is invalid, expired, or already used. Ask another player to generate a new one.');
      }
      return;
    }
    if (this.requestedGame) {
      // Show join intent immediately, before any asynchronous game lookup.
      document.getElementById('entry-context').hidden = false;
      document.querySelector('.entry label').textContent = 'Your name';
      // Keep the same labelled arrow treatment on both entry paths.
      this.screens.form.querySelector('button').firstChild.textContent =
        this.session.edition === 'pride' ? 'Join the party ' : 'Join Game ';
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
      const savedPlayerId = this.session.playerId(gameId);
      const playerId = savedPlayerId || crypto.randomUUID();
      await this.repository.joinGame(gameId, playerId, name);
      if (host) await this.repository.claimHost(gameId, playerId);
      this.session.savePlayer(gameId, playerId,
        savedPlayerId ? this.session.playerGeneration(gameId) : 0);
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
    this.werewolfPackmates = null;
    this.eliminated = false;
    this.staleSession = false;
    this.finalCreditsGameId = null;
    this.stopDayTimer();
    this.stopNightPoll();
    this.presentations.reset();
    this.phaseAdvancer.reset();
    this.decoyPack = null;
    this.seerPack = null;
    this.seerCasting = false;
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
        const member = state.players.find(player => player.id === this.playerId);
        if (!member) {
          this.screens.showConnectionError('Your player membership could not be found.');
          return;
        }
        if (!this.session.testFrame &&
            member.session_generation !== this.session.playerGeneration(id)) {
          this.staleSession = true;
          this.stopDayTimer();
          this.stopNightPoll();
          this.presentations.reset();
          this.phaseAdvancer.reset();
          this.screens.showSessionTransferred();
          return;
        }
        this.state = state;
        // Eliminated players keep the last information available to them.
        if (!this.eliminated) this.screens.renderGameInfo(state);
        // A submitted investigation gets its private response before any
        // simultaneous night-resolution or elimination screen can replace it.
        if (this.seerCasting) return;
        if (this.showSeerResultIfActive()) return;
        const me = state.players.find(player => player.id === this.playerId);
        // Elimination is a permanent player state, independent of the current
        // round's last victim or the current phase.
        if (me.eliminated_at) {
          // Murdered players receive the same timed presentation substate
          // before entering their permanent eliminated state.
          if (!this.eliminated && this.showVictimPresentation(state)) return;
          this.enterEliminatedState(me, state);
          if (state.status !== 'finished') return;
        }
        if (state.status === 'finished' && !this.session.testFrame && this.session.activeGame === id) {
          this.session.clearActive(id);
        }
        if (state.status === 'finished') {
          if (me.eliminated_at) {
            // Preserve the newly murdered player's farewell before credits.
            if (this.presentations.holdVictimFarewell(state, this.playerId)) return;
            this.showFinalCredits(state);
          } else {
            this.isHost = state.hostPlayerId === this.playerId;
            this.decoyPack = state.phase === 'dawn' ? await this.repository.getDecoyPack(id, this.playerId) : null;
            this.renderFinished(state);
          }
          return;
        }
        if (state.status === 'playing' && !this.playerRole) {
          this.playerRole = await this.repository.getMyRole(id, this.playerId);
        }
        if (state.status === 'playing' && state.phase === 'reveal'
            && this.playerRole === 'werewolf' && this.werewolfPackmates === null) {
          this.werewolfPackmates = await this.repository.getWerewolfPackmates(id, this.playerId);
        }
        if (id !== this.state.id || this.eliminated) return;
        this.state = state;
        if (state.phase === 'night' && this.playerRole === 'werewolf') this.nightPack = await this.repository.getNightPack(id, this.playerId);
        if (state.phase === 'night' && this.playerRole === 'villager') this.decoyPack = await this.repository.getDecoyPack(id, this.playerId);
        if (state.phase === 'night' && this.playerRole === 'seer') this.seerPack = await this.repository.getSeerPack(id, this.playerId);
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

  openRecovery() {
    if (!this.state.id || this.state.status !== 'playing' || this.staleSession) return;
    this.screens.openRecovery(this.state);
  }

  async issueRecovery(targetId) {
    if (this.recoverySaving || !this.state.id || this.state.status !== 'playing'
      || this.staleSession || !this.state.players.some(player => player.id === targetId)) return;
    this.recoverySaving = true;
    this.screens.setRecoveryBusy(true);
    this.screens.showRecoveryError('');
    try {
      const gameId = this.state.id;
      const token = await this.repository.issueRejoinTicket(gameId, this.playerId, targetId);
      if (this.state.id !== gameId) return;
      const target = this.state.players.find(player => player.id === targetId);
      await this.screens.renderRecoveryQr(this.session.recoveryLink(token), target?.name || 'Player');
    } catch (error) {
      this.screens.showRecoveryError(error.message || 'Could not generate a rejoin code.');
    } finally {
      this.recoverySaving = false;
      this.screens.setRecoveryBusy(false);
    }
  }

  enterEliminatedState(player, state) {
    if (this.eliminated) return;
    this.eliminated = true;
    this.refreshPending = false;
    this.stopDayTimer();
    this.stopNightPoll();
    this.presentations.stopStep();
    this.presentations.stopHold();
    this.phaseAdvancer.stopRetry();
    const murdered = player.elimination_reason === 'murdered'
      || (!player.elimination_reason && state.lastMurderedId === this.playerId);
    const successor = this.wasHost && state.hostPlayerId !== this.playerId
      ? state.players.find(p => p.id === state.hostPlayerId)?.name : null;
    this.screens.showEliminated(murdered, successor);
  }

  showFinalCredits(state) {
    if (this.finalCreditsGameId === state.id) return;
    this.finalCreditsGameId = state.id;
    void this.repository.getFinalRoles(state.id).then(roles => {
      if (this.state.id === state.id && this.state.status === 'finished') {
        this.screens.renderEndgame(state.winner, roles);
      }
    }).catch(error => this.showActionError(error.message || 'Could not load final roles.'));
  }

  renderTimedPresentation(step) {
    this.presentations.show(step, currentStep => {
      if (currentStep.screen === 'seer-result-screen' && this.presentations.seerResult) {
        this.screens.renderSeerResult(this.presentations.seerResult, currentStep);
      } else if (currentStep.screen === 'dawn-screen') {
        const state = this.state;
        const victim = state.players.find(player => player.id === state.lastMurderedId);
        this.screens.renderMurderReveal(victim?.name || 'A villager',
          state.decoyQuestion, this.decoyPack?.results || [], state.players, currentStep);
      } else if (currentStep.screen === 'banishment-screen') {
        const banished = this.state.players.find(player => player.id === this.state.lastBanishedId);
        if (!banished) this.screens.renderNoBanishment(currentStep);
        else this.screens.renderBanishment(banished.name, currentStep,
          this.state.revealBanishedRole ? this.state.lastBanishedRole : null);
      } else {
        this.screens.renderTimedPresentation(currentStep);
      }
    });
  }

  showSeerResultIfActive() {
    const step = this.presentations.currentSeerStep();
    if (!step) return false;
    this.stopNightPoll();
    this.renderTimedPresentation(step);
    return true;
  }

  showVictimPresentation(state) {
    const step = this.presentations.victimSuspenseStep(state, this.playerId);
    if (!step) return false;
    this.stopNightPoll();
    this.renderTimedPresentation(step);
    return true;
  }

  renderFinished(state) {
    this.stopNightPoll();
    this.stopDayTimer();
    this.phaseAdvancer.stopRetry();
    this.presentations.stopHold();
    const started = Date.parse(state.phaseStartedAt || '');
    const revealDuration = this.stateEngine.presentationDuration(state.phase) || 4000;
    const remaining = Number.isFinite(started) ? Math.max(0, started + revealDuration - Date.now()) : 0;
    if (remaining > 0) {
      const step = this.stateEngine.presentation(state);
      if (step?.screen) {
        this.renderTimedPresentation(step);
        return;
      }
      this.presentations.stopStep();
      if (state.phase === 'dawn') {
        const victim = state.players.find(player => player.id === state.lastMurderedId);
        if (victim?.id === this.playerId) this.screens.showEliminated(true, this.wasHost ? state.players.find(p => p.id === state.hostPlayerId)?.name : null);
        else this.screens.renderMurderReveal(victim?.name || 'A villager',
          state.decoyQuestion, this.decoyPack?.results || [], state.players);
      } else {
        const banished = state.players.find(player => player.id === state.lastBanishedId);
        if (banished?.id === this.playerId) this.screens.showEliminated(false, this.wasHost ? state.players.find(p => p.id === state.hostPlayerId)?.name : null);
        else this.screens.renderBanishment(banished?.name || 'A player', null,
          state.revealBanishedRole ? state.lastBanishedRole : null);
      }
      this.presentations.hold(remaining);
      return;
    }
    this.presentations.stopStep();
    this.showFinalCredits(state);
  }

  async castSeerInvestigation(targetId) {
    if (this.seerCasting || !targetId || this.seerPack?.myInvestigation
      || !this.can('CAST_SEER_INVESTIGATION')) return;
    this.seerCasting = true;
    this.showActionError('');
    try {
      const result = await this.repository.castSeerInvestigation(
        this.state.id, this.state.roundNumber, this.playerId, targetId
      );
      // This client controls the reveal duration, even when night resolves
      // in the same transaction as the investigation.
      this.presentations.startSeerResult(result);
      this.showSeerResultIfActive();
    } catch (error) {
      this.showActionError(error.message || 'Could not investigate that player.');
    } finally {
      this.seerCasting = false;
      this.requestRefresh();
    }
  }

  async castDecoyVote(targetId) {
    if (this.decoyCasting || !targetId || !this.can('CAST_DECOY_VOTE')) return;
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
    if (this.nightCasting || !targetId || !this.can('CAST_NIGHT_VOTE')) return;
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
    // Any phase can configure timed presentation pages. Render those before
    // the ordinary phase screen, without adding another controller branch.
    const view = this.stateEngine.view(state, { playerId: this.playerId });
    if (view.presentation) {
      this.renderTimedPresentation(view.presentation);
      return;
    }
    this.presentations.stopStep();
    if (state.phase !== 'dawn' && state.phase !== 'results') this.phaseAdvancer.stopRetry();
    if (view.stage === 'lobby') {
      this.renderLobby();
      return;
    }
    if (view.stage === 'night') {
      this.screens.renderNight(state, { playerId: this.playerId, role: this.playerRole, pack: this.nightPack, casting: this.nightCasting || this.decoyCasting || this.seerCasting, decoyPack: this.decoyPack, seerPack: this.seerPack });
      this.screens.renderWorkflow(state, { playerId: this.playerId, role: this.playerRole, isHost: this.isHost, pack: this.nightPack, decoyPack: this.decoyPack, seerPack: this.seerPack });
      if (this.nightPoll === null) this.nightPoll = setInterval(() => this.requestRefresh(), 1500);
      return;
    }
    if (view.stage === 'dawn.complete') {
      const victim = state.players.find(player => player.id === state.lastMurderedId);
      this.screens.renderMurderReveal(victim?.name || 'A villager',
        state.decoyQuestion, this.decoyPack?.results || [], state.players);
      void this.phaseAdvancer.advance();
      return;
    }
    if (view.stage === 'results.complete') {
      const banished = state.players.find(player => player.id === state.lastBanishedId);
      if (!banished) this.screens.renderNoBanishment();
      else this.screens.renderBanishment(banished.name, null,
        state.revealBanishedRole ? state.lastBanishedRole : null);
      void this.phaseAdvancer.advance();
      return;
    }
    if (view.stage.startsWith('day.')) {
      this.renderDay();
      this.dayTicker = setInterval(() => this.renderDay(), 250);
      return;
    }
    this.screens.showRole(this.playerRole, this.werewolfPackmates);
    this.screens.renderRoleStartControls(this);
    this.screens.renderWorkflow(state, { isHost: this.isHost, playerId: this.playerId });
  }

  renderDay() {
    if (this.eliminated) return;
    const state = this.state;
    if (state.phase !== 'day') { this.stopDayTimer(); return; }
    const deadline = Date.parse(state.phaseStartedAt || '') + (state.dayDurationSeconds ?? 120) * 1000;
    const seconds = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : (state.dayDurationSeconds ?? 120);
    if (seconds === 0 && state.step === 'discussion' && !this.openingVoting) void this.openDayVoting();
    const voting = this.stateEngine.stage(state, this.playerId) === 'day.voting';
    const active = state.players.filter(player => !player.eliminated_at);
    const runoff = state.runoffEnabled && state.voteStage === 'runoff';
    const votes = (runoff ? state.runoffVotes : state.votes)
      .filter(vote => vote.round_number === state.roundNumber);
    const myVote = votes.find(vote => vote.voter_id === this.playerId);
    if (voting && votes.length === active.length) {
      this.stopDayTimer();
      const target = state.players.find(player => player.id === myVote?.target_id);
      this.screens.renderMarquee(target?.name || 'Votes in', this.isHost && !runoff, this.finishing);
      return;
    }
    // Avoid rebuilding the select list on every clock tick.
    const signature = state.roundNumber + ':' + state.voteStage + ':' + votes.length + ':' + Boolean(myVote);
    if (this.dayVotingOpen !== voting || this.dayVoteSignature !== signature || document.getElementById('day-screen').hidden) {
      this.screens.renderDay(state, { playerId: this.playerId, isHost: this.isHost, voting, myVote, casting: this.casting, endingDiscussion: this.endingDiscussion });
      this.dayVotingOpen = voting;
      this.dayVoteSignature = signature;
      this.screens.renderWorkflow(state, { isHost: this.isHost, playerId: this.playerId });
    }
    if (!voting) this.screens.updateClock(seconds);
    document.getElementById('vote-progress').textContent = voting
      ? myVote ? 'Vote locked. Waiting for everyone… ' + votes.length + '/' + active.length
        : 'Votes cast: ' + votes.length + '/' + active.length
      : '';
  }

  async openDayVoting() {
    if (this.openingVoting || !this.can('OPEN_VOTING')) return;
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
    if (this.endingDiscussion || !this.can('END_DISCUSSION')) return;
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
    if (this.casting || !targetId || targetId === this.playerId || !this.can('CAST_DAY_VOTE')) return;
    this.casting = true;
    this.showActionError('');
    try {
      if (this.state.runoffEnabled && this.state.voteStage === 'runoff') {
        await this.repository.castRunoffVote(this.state.id, this.state.roundNumber, this.playerId, targetId);
      } else {
        await this.repository.castVote(this.state.id, this.state.roundNumber, this.playerId, targetId);
      }
      this.requestRefresh();
    } catch (error) {
      this.showActionError(error.message || 'Could not cast vote.');
    } finally {
      this.casting = false;
    }
  }

  async finishVoting() {
    if (this.finishing || !this.can('FINISH_DAY')) return;
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

  async changeWerewolves(delta) {
    if (this.eliminated || !this.isHost || this.starting || this.state.status !== 'lobby') return;
    const next = this.engine.nextWerewolfCount(this.state, delta);
    if (next === this.state.werewolfCount) return;
    try {
      await this.repository.setWerewolfCount(this.state.id, next);
      this.requestRefresh();
    } catch (error) { this.showActionError(error.message); }
  }

  async changeSeers(delta) {
    if (this.eliminated || !this.isHost || this.starting || this.state.status !== 'lobby') return;
    const next = this.engine.nextSeerCount(this.state, delta);
    if (next === this.state.seerCount) return;
    try {
      await this.repository.setSeerCount(this.state.id, this.playerId, next);
      this.requestRefresh();
    } catch (error) {
      this.showActionError(error.message || 'Could not change the Seer count.');
    }
  }

  async changeRevealBanishedRole(enabled) {
    if (this.eliminated || !this.isHost || this.starting || this.revealBanishedRoleSaving
        || this.state.status !== 'lobby' || enabled === this.state.revealBanishedRole) return;
    this.revealBanishedRoleSaving = true;
    this.pendingBanishedRoleReveal = enabled;
    this.renderLobby();
    this.showActionError('');
    try {
      await this.repository.setRevealBanishedRole(this.state.id, this.playerId, enabled);
      // Reflect the confirmed setting immediately; Realtime will also refresh it.
      if (this.state.status === 'lobby') {
        this.state = this.state.with({ revealBanishedRole: enabled });
      }
      this.requestRefresh();
    } catch (error) {
      this.showActionError(error.message || 'Could not update the role reveal setting.');
      this.requestRefresh();
    } finally {
      this.revealBanishedRoleSaving = false;
      this.pendingBanishedRoleReveal = null;
      if (this.state.status === 'lobby') this.renderLobby();
    }
  }

  async advancePhase() {
    if (this.advancing || !this.can('START_DAY')) return;
    this.advancing = true;
    this.screens.renderRoleStartControls(this);
    this.showActionError('');
    try {
      const fresh = await this.repository.getState(this.state.id);
      const next = this.stateEngine.transition(fresh, { type: 'START_DAY' });
      await this.repository.advancePhase(fresh, next, this.playerId);
      this.requestRefresh();
    } catch (error) {
      this.showActionError(error.message || 'Could not advance the game.');
      this.requestRefresh();
    } finally {
      this.advancing = false;
      if (this.state.status === 'playing' && this.state.phase === 'reveal') this.screens.renderRoleStartControls(this);
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
