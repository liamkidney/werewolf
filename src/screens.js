import { ROLES } from './role-registry.js';
import { getGameInfo } from './game-info.js';
import { workflowStatus } from './workflow-status.js';
import QRCode from 'qrcode';

const $ = id => document.getElementById(id);

const GAME_INFO_ICONS = {
  villager: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/><path d="M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1"/>',
  seer: '<path d="M2 12s3.7-6 10-6 10 6 10 6-3.7 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  bodyguard: '<path d="M12 2 4 5v6c0 5 3 9 8 11 5-2 8-6 8-11V5l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
  werewolf: '<path d="m4 3 5 4h6l5-4-1 11-3 5-4 3-4-3-3-5Z"/><path d="m8 13 2 1m6-1-2 1m-4 4 2 1 2-1"/>'
};

export class Screens {
  constructor() {
    this.form = $('new-game');
    this.nameInput = $('player-name');
    this.marqueeFont = null;
    this.dayVoteRound = null;
    // Retain the standard day illustration until the new victory asset is deployed.
    const victoryArt = $('endgame-screen').querySelector('.endgame-day-art img');
    victoryArt.addEventListener('error', () => {
      if (victoryArt.getAttribute('src') !== './images/werewolf-day.png') {
        victoryArt.src = './images/werewolf-day.png';
      }
    });
  }

  showError(message) {
    $('app-error').textContent = message;
    $('app-error').hidden = !message;
    $('marquee-error').textContent = message;
    $('marquee-error').hidden = !message;
  }

  showConnectionError(message) {
    $('connection-error').textContent = message;
    $('connection-error').hidden = !message;
  }

  showScreen(id) {
    const oldStatus = document.getElementById('workflow-status');
    if (oldStatus) oldStatus.remove();
    document.body.classList.add('light-screen');
    document.body.classList.toggle('marquee-mode', id === 'marquee-screen');
    if (id !== 'marquee-screen') this.marqueeFont = null;
    document.querySelector('.hero').hidden = true;
    this.form.hidden = true;
    $('resume-game').hidden = true;
    $('game-footer').hidden = false;
    $('role-reveal').classList.remove('revealed');
    $('role-reveal').querySelector('.role-secret').setAttribute('aria-hidden', 'true');
    for (const screen of ['lobby', 'role-screen', 'day-screen', 'night-screen', 'dawn-screen', 'endgame-screen', 'suspense-screen', 'seer-result-screen', 'marquee-screen', 'banishment-screen', 'session-transferred']) $(screen).hidden = screen !== id;
  }

  showSessionTransferred() {
    this.showScreen('session-transferred');
    $('game-info-button').hidden = true;
    const infoDialog = $('game-info-dialog');
    if (infoDialog.open) infoDialog.close();
    const recoveryDialog = $('recovery-dialog');
    if (recoveryDialog.open) recoveryDialog.close();
  }

  openRecovery(state) {
    const picker = $('recovery-player');
    picker.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a player';
    picker.append(placeholder);
    for (const player of state.players) {
      const option = document.createElement('option');
      option.value = player.id;
      option.textContent = player.name;
      picker.append(option);
    }
    picker.value = '';
    $('recovery-result').hidden = true;
    $('recovery-generate').disabled = true;
    this.showRecoveryError('');
    $('recovery-dialog').showModal();
  }

  setRecoveryBusy(busy) {
    $('recovery-generate').disabled = busy || !$('recovery-player').value;
    $('recovery-generate').textContent = busy ? 'Generating…' : 'Generate QR code';
  }

  showRecoveryError(message) {
    $('recovery-error').textContent = message;
    $('recovery-error').hidden = !message;
  }

  async renderRecoveryQr(url, name) {
    await QRCode.toCanvas($('recovery-qr'), url, {
      width: 240, margin: 2, color: { dark: '#111d2c', light: '#ffffff' }
    });
    $('recovery-result-name').textContent = 'Scan to rejoin as ' + name;
    $('recovery-result').hidden = false;
  }

  renderGameInfo(state) {
    const button = $('game-info-button');
    const dialog = $('game-info-dialog');
    button.hidden = state.status !== 'playing' && state.status !== 'finished';
    $('help-rejoin').hidden = state.status !== 'playing';
    if (button.hidden) {
      if (dialog.open) dialog.close();
      return;
    }

    const info = getGameInfo(state);
    $('game-info-total').textContent = info.total + (info.total === 1 ? ' player' : ' players');

    const rolesList = $('game-info-roles');
    rolesList.replaceChildren();
    for (const { role, count } of info.roles) {
      const item = document.createElement('li');
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.classList.add('game-info-role-icon');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('stroke-width', '1.7');
      icon.setAttribute('stroke-linejoin', 'round');
      icon.setAttribute('stroke-linecap', 'round');
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = GAME_INFO_ICONS[role] || '';
      const name = document.createElement('span');
      const number = document.createElement('strong');
      const singular = ROLES.label(role);
      name.className = 'game-info-role-label';
      name.textContent = count === 1 ? singular
        : role === 'werewolf' ? 'Werewolves' : singular + 's';
      number.textContent = String(count);
      item.append(icon, name, number);
      rolesList.append(item);
    }

    const renderNames = (id, titleId, title, names) => {
      $(titleId).textContent = title + ' (' + names.length + ')';
      const list = $(id);
      list.replaceChildren();
      if (!names.length) {
        const empty = document.createElement('li');
        empty.className = 'game-info-empty';
        empty.textContent = 'None yet';
        list.append(empty);
        return;
      }
      for (const name of names) {
        const item = document.createElement('li');
        item.textContent = name;
        list.append(item);
      }
    };
    renderNames('game-info-banished', 'game-info-banished-title', 'Banished', info.banished);
    renderNames('game-info-murdered', 'game-info-murdered-title', 'Murdered', info.murdered);
  }

  renderWorkflow(state, context = {}) {
    const info = workflowStatus(state, context);
    if (!info) return;
    const visible = [...document.querySelectorAll('#lobby, #role-screen, #day-screen, #night-screen, #dawn-screen, #banishment-screen')].find(el => !el.hidden);
    if (!visible) return;
    document.getElementById('workflow-status')?.remove();
    const panel = document.createElement('section');
    panel.id = 'workflow-status';
    panel.className = 'workflow-status';
    panel.setAttribute('aria-label', 'Game progress');
    const add = (tag, className, value) => {
      const el = document.createElement(tag);
      el.className = className;
      el.textContent = value;
      panel.append(el);
    };
    add('div', 'workflow-label', info.label);
    const next = document.createElement('div');
    next.className = 'workflow-next';
    const prefix = document.createElement('span');
    prefix.className = 'workflow-next-label';
    prefix.textContent = 'NEXT';
    const detail = document.createElement('span');
    detail.textContent = info.next;
    const arrow = document.createElement('span');
    arrow.className = 'workflow-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    next.append(prefix, detail, arrow);
    panel.append(next);
    document.body.append(panel);
  }

  showLobby(gameId, isHost, inviteUrl) {
    this.showScreen('lobby');
    $('host-controls').hidden = !isHost;
    $('host-tools').hidden = !isHost;
    $('guest-intro').hidden = isHost;
    $('invite-link').value = inviteUrl;
  }

  renderLobby(state, { isHost, playerId, starting, canStart, savingReveal = false }) {
    const list = $('player-list');
    list.replaceChildren();
    state.players.forEach((player, index) => {
      const item = document.createElement('li');
      const dot = document.createElement('span');
      dot.remove();
      const name = document.createElement('span');
      const mine = player.id === playerId;
      name.textContent = player.name + (mine ? ' (you)' : '');
      if (mine) name.className = 'my-name';
      item.append(name);
      list.append(item);
    });
    const count = state.players.length;
    $('lobby-message').textContent = count + (count === 1 ? ' player joined' : ' players joined');
    $('werewolf-count').textContent = state.werewolfCount;
    $('seer-count').textContent = state.seerCount ?? 0;
    $('bodyguard-count').textContent = state.bodyguardCount ?? 0;
    $('reveal-banished-role').checked = !!state.revealBanishedRole;
    $('reveal-banished-role').disabled = !isHost || starting || savingReveal || state.status !== 'lobby';
    $('minimum-label').textContent = 'Minimum ' + Math.max(3, state.werewolfCount + (state.seerCount ?? 0) + (state.bodyguardCount ?? 0) + 1);
    $('wolf-minus').disabled = starting || state.werewolfCount <= 1 || state.status !== 'lobby';
    $('wolf-plus').disabled = starting || state.werewolfCount >= 50 || state.status !== 'lobby';
    $('seer-minus').disabled = starting || (state.seerCount ?? 0) <= 0 || state.status !== 'lobby';
    $('seer-plus').disabled = starting || (state.seerCount ?? 0) >= 50 || state.status !== 'lobby';
    $('bodyguard-minus').disabled = starting || (state.bodyguardCount ?? 0) <= 0 || state.status !== 'lobby';
    $('bodyguard-plus').disabled = starting || (state.bodyguardCount ?? 0) >= 50 || state.status !== 'lobby';
    $('start-game').disabled = !isHost || !canStart || starting || savingReveal;
    $('start-game').textContent = starting ? 'Assigning roles…' : 'Start Game';
  }

  showRole(role, packmates = null) {
    this.showScreen('role-screen');
    document.querySelector('.role-reminder').hidden = false;
    $('role-name').textContent = role ? ROLES.label(role) : 'Assigning roles…';
    $('role-reveal').classList.remove('revealed');
    $('role-reveal').querySelector('.role-secret').setAttribute('aria-hidden', 'true');
    $('role-description').textContent = role ? ROLES.description(role) : 'Please wait a moment.';

    // Packmates are private and belong inside the existing hold-to-reveal area.
    const pack = $('role-pack');
    pack.hidden = role !== 'werewolf';
    const names = role === 'werewolf' && Array.isArray(packmates) ? packmates : [];
    $('role-pack-names').textContent = names.join(' · ');
    $('role-pack-names').hidden = !names.length;
    $('role-pack-heading').textContent = role !== 'werewolf' ? ''
      : packmates === null ? 'Finding your pack…'
      : names.length ? 'Your fellow werewolves' : 'You are the only werewolf.';
  }

  showEliminated(murdered = false, newHostName = null) {
    this.showScreen('banishment-screen');
    $('banishment-screen').classList.toggle('murdered-screen', murdered);
    $('banishment-screen').querySelector('.murder-art').hidden = !murdered;
    $('banishment-screen').querySelector('.banished-art').hidden = murdered;
    $('elimination-heading').textContent = murdered ? 'MURDERED' : 'BANISHED';
    $('banished-name').textContent = murdered ? 'You were murdered' : 'You have been banished';
    $('banishment-description').textContent = 'You are out of the game.' + (newHostName ? ' ' + newHostName + ' is now the host.' : '');
    $('banishment-role').hidden = true;
    $('banishment-role').textContent = '';
    $('banishment-screen').querySelector('.presentation-progress').hidden = true;
  }

  renderRoleStartControls({ isHost, advancing }) {
    $('phase-host-controls').hidden = !isHost;
    $('advance-phase').textContent = advancing ? 'Updating…' : 'Start Day';
    $('advance-phase').disabled = advancing;
  }

  // Any timed presentation substate uses this same progress indicator.
  // Changing the screen within the sequence requires no controller changes.
  renderTimedPresentation(step) {
    this.showScreen(step.screen);
    this.updateTimedProgress(step.screen, step);
  }

  updateTimedProgress(screenId, step) {
    const progress = $(screenId).querySelector('.presentation-progress');
    if (!progress) return;
    const fill = progress.querySelector('.presentation-progress-fill');
    progress.setAttribute('aria-valuenow', String(Math.round(step.progress * 100)));
    fill.style.animationDuration = step.durationMs + 'ms';
    fill.style.animationDelay = '-' + step.elapsedMs + 'ms';
  }

  renderSeerResult(investigation, step) {
    this.renderTimedPresentation(step);
    $('seer-result-name').textContent = investigation.targetName;
    $('seer-result-verdict').textContent = investigation.isWerewolf
      ? 'IS A WEREWOLF'
      : 'Is not a werewolf';
    $('seer-result-verdict').classList.toggle('not-werewolf', !investigation.isWerewolf);
  }

  renderMurderReveal(name, question = null, results = [], players = [], timedStep = null) {
    this.showScreen('dawn-screen');
    $('dawn-victim').textContent = name;
    $('dawn-decoy').hidden = !question;
    $('dawn-decoy-question').textContent = question || '';
    const max = Math.max(0, ...results.map(item => item.votes));
    const leaders = results.filter(item => item.votes === max && max > 0);
    const names = leaders.map(item => players.find(player => player.id === item.id)?.name || 'Unknown');
    const total = results.reduce((sum, item) => sum + item.votes, 0);
    $('dawn-decoy-result').textContent = !total ? 'No votes were cast.'
      : names.join(', ') + ' — ' + max + (max === 1 ? ' vote' : ' votes') + ' (' + total + ' total).';
    // A timed dawn reveal always progresses to the day without host input.
    const step = timedStep || { durationMs: 1, elapsedMs: 1, progress: 1 };
    this.updateTimedProgress('dawn-screen', step);
  }

  renderEndgame(winner, roles) {
    this.showScreen('endgame-screen');
    const wolvesWon = winner !== 'village';
    $('endgame-screen').classList.toggle('wolves-won', wolvesWon);
    $('endgame-screen').querySelector('.endgame-day-art').hidden = wolvesWon;
    $('endgame-screen').querySelector('.endgame-night-art').hidden = !wolvesWon;
    $('endgame-winner').textContent = wolvesWon ? 'The Werewolves Win' : 'The Villagers Win';
    const list = $('endgame-roles');
    list.replaceChildren();
    const victorious = player => ROLES.isOnTeam(player.role, wolvesWon ? 'werewolves' : 'village');
    const stars = roles.filter(player => victorious(player) && !player.eliminated);
    const supporting = roles.filter(player => !victorious(player) || player.eliminated);

    const addCredit = (player, supportingRole) => {
      const entry = document.createElement('div');
      entry.className = 'endgame-credit';
      const role = document.createElement('span');
      role.className = 'endgame-credit-role';
      const character = ROLES.label(player.role);
      const fate = player.elimination_reason === 'murdered' ? 'Murdered'
        : player.elimination_reason === 'banished' ? 'Banished'
        : player.eliminated ? 'Eliminated' : '';
      role.textContent = supportingRole && fate ? fate + ' ' + character : character;
      const details = document.createElement('div');
      details.className = 'endgame-credit-details';
      const name = document.createElement('span');
      name.className = 'endgame-credit-name';
      name.textContent = player.name.toLocaleUpperCase();
      details.append(name);
      entry.append(role, details);
      list.append(entry);
    };

    for (const player of stars) addCredit(player, false);
    if (supporting.length) {
      const heading = document.createElement('p');
      heading.className = 'endgame-credits-intro endgame-credits-supporting-heading';
      heading.textContent = 'ALSO APPEARING';
      list.append(heading);
      for (const player of supporting) addCredit(player, true);
    }
    const roll = $('endgame-screen').querySelector('.endgame-credits-roll');
    roll.style.animation = 'none';
    void roll.offsetWidth;
    roll.style.animation = '';

  }

  renderNight(state, { playerId, role, pack, casting, decoyPack, seerPack }) {
    this.showScreen('night-screen');
    $('night-round').textContent = state.roundNumber;
    $('night-heading').textContent = 'Night has fallen';
    const wolf = role === 'werewolf';
    const seer = role === 'seer';
    const loneWolf = wolf && pack?.wolves?.length === 1;
    $('night-instruction').textContent = wolf
      ? loneWolf ? 'You are the only werewolf! Pick a villager to eliminate.'
        : 'Agree on one villager to eliminate.'
      : seer ? 'Investigate one player. Your choice is final.'
      : 'Cast your vote. The results will be revealed at dawn.';
    $('night-villager-controls').hidden = role !== 'villager';
    if (role === 'villager') {
      $('decoy-question').textContent = state.decoyQuestion || decoyPack?.question || 'Who is least trustworthy?';
      const choices = $('decoy-targets');
      choices.replaceChildren();
      for (const player of state.players.filter(p => !p.eliminated_at && p.id !== playerId)) {
        const label = document.createElement('label');
        label.className = 'night-choice';
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = 'decoy-target'; radio.value = player.id;
        radio.checked = decoyPack?.myVote === player.id;
        radio.disabled = casting;
        const name = document.createElement('span'); name.className = 'night-name'; name.textContent = player.name;
        label.append(radio, name); choices.append(label);
      }
      $('decoy-progress').textContent = decoyPack?.myVote ? 'Vote recorded. You can change it until dawn.' : 'Choose another player.';
    }
    $('night-seer-controls').hidden = !seer;
    if (seer) {
      const investigation = seerPack?.myInvestigation;
      const choices = $('seer-targets');
      choices.hidden = !!investigation;
      choices.replaceChildren();
      if (!investigation) {
        for (const player of state.players.filter(p => !p.eliminated_at && p.id !== playerId)) {
          const label = document.createElement('label');
          label.className = 'night-choice';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'seer-target';
          radio.value = player.id;
          radio.disabled = casting;
          const name = document.createElement('span');
          name.className = 'night-name';
          name.textContent = player.name;
          label.append(radio, name);
          choices.append(label);
        }
      }
      $('seer-progress').textContent = investigation
        ? 'Investigation recorded. Waiting for the other night actions.'
        : 'Choose another living player. You cannot change your choice.';
      const history = (seerPack?.history || []).filter(item => item.roundNumber < state.roundNumber);
      $('seer-history-wrap').hidden = history.length === 0;
      const list = $('seer-history-list');
      list.replaceChildren();
      for (const item of history) {
        const li = document.createElement('li');
        li.textContent = 'Night ' + item.roundNumber + ': ' + item.targetName
          + (item.isWerewolf ? ' — Werewolf' : ' — Not a werewolf');
        list.append(li);
      }
    }
    $('night-wolf-controls').hidden = !wolf;
    if (!wolf) return;
    const wolves = pack?.wolves || [];
    const votes = pack?.votes || [];
    $('night-wolf-roster').hidden = loneWolf;
    $('night-wolf-choose-heading').hidden = loneWolf;
    const list = $('night-wolves');
    list.replaceChildren();
    if (!loneWolf) {
      const names = new Map(state.players.map(player => [player.id, player.name]));
      for (const member of wolves) {
        const vote = votes.find(item => item.voter_id === member.id);
        const item = document.createElement('li');
        item.textContent = member.name + (member.id === playerId ? ' (you)' : '') + ' — ' + (vote ? names.get(vote.target_id) || 'Unknown' : 'Not nominated');
        list.append(item);
      }
    }
    const choices = $('night-targets');
    const selected = votes.find(item => item.voter_id === playerId)?.target_id;
    choices.replaceChildren();
    for (const player of state.players.filter(p => !p.eliminated_at && !wolves.some(w => w.id === p.id))) {
      const label = document.createElement('label');
      label.className = 'night-choice';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'night-target';
      radio.value = player.id;
      radio.checked = selected === player.id;
      radio.disabled = casting;
      const name = document.createElement('span');
      name.className = 'night-name';
      name.textContent = player.name;
      if (loneWolf) {
        // Direct selection: no consensus meter or pack percentage.
        label.append(radio, name);
      } else {
        const count = votes.filter(v => v.target_id === player.id).length;
        const percent = wolves.length ? Math.round(count * 100 / wolves.length) : 0;
        const bar = document.createElement('span');
        bar.className = 'night-bar';
        bar.style.width = percent + '%';
        const share = document.createElement('span');
        share.className = 'night-percent';
        share.textContent = percent + '%';
        label.append(bar, radio, name, share);
      }
      choices.append(label);
    }
    $('night-progress').textContent = loneWolf
      ? selected ? 'Choice recorded. Waiting for the remaining night actions.' : ''
      : votes.length + '/' + wolves.length + ' votes. Unanimous agreement ends the night.';
  }

  renderDay(state, { playerId, isHost, voting, myVote, casting, endingDiscussion }) {
    this.showScreen('day-screen');
    $('day-round').textContent = state.roundNumber;
    const runoff = state.runoffEnabled && state.voteStage === 'runoff';
    $('day-heading').textContent = runoff ? 'Runoff vote' : (voting ? 'Vote to banish' : 'Discuss');
    $('day-clock').hidden = voting;
    $('end-discussion').hidden = voting || !isHost;
    $('end-discussion').disabled = endingDiscussion;
    $('day-instruction').textContent = runoff
      ? 'The vote was tied. Choose among the leading candidates. Your vote is final.'
      : (voting ? 'Choose one player. Your vote is final.'
        : 'Discuss who should be banished. Voting opens when the timer ends.');
    const active = state.players.filter(player => !player.eliminated_at);
    const voted = (runoff ? state.runoffVotes : state.votes)
      .filter(vote => vote.round_number === state.roundNumber).length;
    $('vote-controls').hidden = !voting || !!myVote || !active.some(player => player.id === playerId);
    const choices = $('vote-targets');
    // Preserve a pending selection only within the same round. The DOM is
    // reused between rounds, so a previous round's checked radio is stale.
    const voteKey = state.roundNumber + ':' + (runoff ? 'runoff' : 'initial');
    const selected = this.dayVoteRound === voteKey
      ? choices.querySelector('input[name="vote-target"]:checked')?.value
      : null;
    this.dayVoteRound = voteKey;
    choices.replaceChildren();
    const eligible = runoff
      ? active.filter(player => state.runoffCandidates.includes(player.id))
      : active;
    for (const player of eligible.filter(player => player.id !== playerId)) {
      const label = document.createElement('label');
      label.className = 'night-choice';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'vote-target';
      radio.value = player.id;
      radio.checked = selected === player.id;
      radio.disabled = casting;
      const name = document.createElement('span');
      name.className = 'night-name';
      name.textContent = player.name;
      label.append(radio, name);
      choices.append(label);
    }
    $('vote-progress').textContent = !voting ? '' : myVote
      ? 'Vote locked. Waiting for everyone… ' + voted + '/' + active.length
      : 'Votes cast: ' + voted + '/' + active.length;
  }

  updateClock(seconds) {
    $('day-clock').textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  renderMarquee(name, isHost, finishing) {
    this.showScreen('marquee-screen');
    $('marquee-vote').textContent = name;
    if (!this.marqueeFont) {
      const fonts = ['Fredericka the Great', 'Rock Salt', 'Gloria Hallelujah', 'Permanent Marker'];
      this.marqueeFont = fonts[Math.floor(Math.random() * fonts.length)];
    }
    $('marquee-vote').style.fontFamily = `'${this.marqueeFont}', cursive`;
    $('finish-voting').hidden = !isHost;
    $('finish-voting').disabled = finishing;
    $('finish-voting').textContent = finishing ? 'Finishing…' : 'All Done';
  }

  renderBanishment(name, step = null, role = null) {
    this.showScreen('banishment-screen');
    const screen = $('banishment-screen');
    screen.classList.remove('murdered-screen');
    screen.querySelector('.murder-art').hidden = true;
    screen.querySelector('.banished-art').hidden = false;
    screen.querySelector('.presentation-progress').hidden = false;
    $('elimination-heading').textContent = 'BANISHED';
    $('banished-name').textContent = name;
    const roleLabel = $('banishment-role');
    roleLabel.hidden = !role;
    roleLabel.textContent = role ? 'Revealed as ' + ROLES.label(role) : '';
    $('banishment-description').textContent = name + ' has been eliminated from the game.';
    this.updateTimedProgress('banishment-screen', step || {
      durationMs: 1, elapsedMs: 1, progress: 1
    });
  }

  renderNoBanishment(step = null) {
    this.renderBanishment('The village is divided', step);
    $('elimination-heading').textContent = 'NO BANISHMENT';
    $('banishment-description').textContent = 'The runoff ended in a tie. Nobody is banished.';
  }

  async renderQr(inviteUrl) {
    await QRCode.toCanvas($('join-qr'), inviteUrl, {
      width: 220, margin: 2, color: { dark: '#111d2c', light: '#ffffff' }
    });
  }

  bind(handlers) {
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      void handlers.onJoin();
    });
    this.nameInput.addEventListener('input', () => { $('name-error').hidden = true; });
    const infoDialog = $('game-info-dialog');
    $('game-info-button').addEventListener('click', () => infoDialog.showModal());
    $('game-info-close').addEventListener('click', () => infoDialog.close());
    infoDialog.addEventListener('click', event => {
      if (event.target === infoDialog) infoDialog.close();
    });
    const recoveryDialog = $('recovery-dialog');
    $('help-rejoin').addEventListener('click', () => {
      infoDialog.close();
      handlers.onOpenRecovery();
    });
    $('recovery-close').addEventListener('click', () => recoveryDialog.close());
    recoveryDialog.addEventListener('click', event => {
      if (event.target === recoveryDialog) recoveryDialog.close();
    });
    $('recovery-player').addEventListener('change', () => {
      $('recovery-result').hidden = true;
      this.showRecoveryError('');
      this.setRecoveryBusy(false);
    });
    $('recovery-generate').addEventListener('click', () => {
      const targetId = $('recovery-player').value;
      if (targetId) void handlers.onIssueRecovery(targetId);
    });
    $('wolf-minus').addEventListener('click', () => { void handlers.onWerewolves(-1); });
    $('wolf-plus').addEventListener('click', () => { void handlers.onWerewolves(1); });
    $('seer-minus').addEventListener('click', () => { void handlers.onSeers(-1); });
    $('seer-plus').addEventListener('click', () => { void handlers.onSeers(1); });
    $('reveal-banished-role').addEventListener('change', event => {
      void handlers.onRevealBanishedRole(event.target.checked);
    });
    $('start-game').addEventListener('click', () => { void handlers.onStart(); });
    const reveal = $('role-reveal');
    const setRevealed = visible => {
      reveal.classList.toggle('revealed', visible);
      reveal.querySelector('.role-secret').setAttribute('aria-hidden', String(!visible));
    };
    reveal.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      reveal.setPointerCapture(event.pointerId);
      setRevealed(true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      reveal.addEventListener(type, () => setRevealed(false));
    }
    reveal.addEventListener('keydown', event => {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        if (!event.repeat) setRevealed(true);
      }
    });
    reveal.addEventListener('keyup', event => {
      if (event.code === 'Space' || event.code === 'Enter') setRevealed(false);
    });
    reveal.addEventListener('blur', () => setRevealed(false));
    reveal.addEventListener('contextmenu', event => event.preventDefault());
    $('advance-phase').addEventListener('click', () => { void handlers.onAdvance(); });
    $('end-discussion').addEventListener('click', () => { void handlers.onEndDiscussion(); });
    $('vote-targets').addEventListener('change', event => {
      if (event.target.matches('input[name="vote-target"]')) void handlers.onVote(event.target.value);
    });
    $('decoy-targets').addEventListener('change', event => {
      if (event.target.matches('input[name="decoy-target"]')) void handlers.onDecoyVote(event.target.value);
    });
    $('night-targets').addEventListener('change', event => {
      if (event.target.matches('input[name="night-target"]')) void handlers.onNightVote(event.target.value);
    });
    $('seer-targets').addEventListener('change', event => {
      if (event.target.matches('input[name="seer-target"]')) void handlers.onSeerInvestigation(event.target.value);
    });

    $('finish-voting').addEventListener('click', () => { void handlers.onFinishVoting(); });
    let feedbackTimeout;
    $('copy-link').addEventListener('click', async () => {
      const feedback = $('copy-feedback');
      clearTimeout(feedbackTimeout);
      try {
        await navigator.clipboard.writeText($('invite-link').value);
        feedback.textContent = 'Copied!';
      } catch {
        feedback.textContent = 'Unable to copy';
      }
      feedbackTimeout = setTimeout(() => { feedback.textContent = ''; }, 2000);
    });
  }
}
