import { PHASES } from './game-phases.js';
import QRCode from 'qrcode';

const $ = id => document.getElementById(id);

export class Screens {
  constructor() {
    this.form = $('new-game');
    this.nameInput = $('player-name');
    this.marqueeFont = null;
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
    document.body.classList.add('light-screen');
    document.body.classList.toggle('marquee-mode', id === 'marquee-screen');
    if (id !== 'marquee-screen') this.marqueeFont = null;
    document.querySelector('.hero').hidden = true;
    this.form.hidden = true;
    $('resume-game').hidden = true;
    $('game-footer').hidden = false;
    $('role-reveal').classList.remove('revealed');
    $('role-reveal').querySelector('.role-secret').setAttribute('aria-hidden', 'true');
    for (const screen of ['lobby', 'role-screen', 'day-screen', 'night-screen', 'dawn-screen', 'endgame-screen', 'suspense-screen', 'marquee-screen', 'banishment-screen']) $(screen).hidden = screen !== id;
  }

  showLobby(gameId, isHost, inviteUrl) {
    this.showScreen('lobby');
    $('host-controls').hidden = !isHost;
    $('host-tools').hidden = !isHost;
    $('guest-intro').hidden = isHost;
    $('invite-link').value = inviteUrl;
  }

  renderLobby(state, { isHost, playerId, starting, canStart }) {
    const list = $('player-list');
    list.replaceChildren();
    state.players.forEach((player, index) => {
      const item = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'player-dot dot-' + (index % 6);
      const name = document.createElement('span');
      const mine = player.id === playerId;
      name.textContent = player.name + (mine ? ' (you)' : '');
      if (mine) name.className = 'my-name';
      item.append(dot, name);
      list.append(item);
    });
    const count = state.players.length;
    $('lobby-message').textContent = count + (count === 1 ? ' player joined' : ' players joined');
    $('werewolf-count').textContent = state.werewolfCount;
    $('minimum-label').textContent = 'Minimum ' + (state.werewolfCount + 1);
    $('wolf-minus').disabled = starting || state.werewolfCount <= 1 || state.status !== 'lobby';
    $('wolf-plus').disabled = starting || state.werewolfCount >= 50 || state.status !== 'lobby';
    $('start-game').disabled = !isHost || !canStart || starting;
    $('start-game').textContent = starting ? 'Assigning roles…' : 'Start Game';
  }

  showRole(role) {
    this.showScreen('role-screen');
    document.querySelector('.role-reminder').hidden = false;
    $('role-name').textContent = role ? (role === 'werewolf' ? 'Werewolf' : 'Villager') : 'Assigning roles…';
    $('role-reveal').classList.remove('revealed');
    $('role-reveal').querySelector('.role-secret').setAttribute('aria-hidden', 'true');
    $('role-description').textContent = role
      ? (role === 'werewolf' ? 'You are a werewolf. Keep your identity hidden.' : 'You are a villager. Find the werewolves.')
      : 'Please wait a moment.';
  }

  showEliminated(murdered = false, newHostName = null) {
    this.showScreen('banishment-screen');
    $('banishment-screen').classList.toggle('murdered-screen', murdered);
    $('banishment-screen').querySelector('.murder-art').hidden = !murdered;
    $('banishment-screen').querySelector('.banished-art').hidden = murdered;
    $('elimination-heading').textContent = murdered ? 'MURDERED' : 'BANISHED';
    $('banished-name').textContent = murdered ? 'You were murdered' : 'You have been banished';
    $('banishment-description').textContent = 'You are out of the game.' + (newHostName ? ' ' + newHostName + ' is now the host.' : '');
    $('dismiss-banishment').hidden = true;
    $('banishment-waiting').hidden = true;
  }

  showSpectator() {
    $('role-name').textContent = 'Eliminated';
    $('role-description').textContent = 'You are watching the rest of the game.';
    document.querySelector('.role-reminder').hidden = true;
  }

  renderPhase(state, { isHost, advancing }) {
    const phase = PHASES[state.phase];
    $('phase-host-controls').hidden = !isHost;
    $('advance-phase').textContent = advancing ? 'Updating…' : phase?.action || 'Continue';
    $('advance-phase').disabled = advancing;
  }

  renderSuspense() {
    this.showScreen('suspense-screen');
  }

  renderMurderReveal(name, isHost, question = null, results = [], players = []) {
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
    $('dismiss-dawn').hidden = !isHost;
    $('dawn-waiting').hidden = isHost;
  }

  renderEndgame(winner, roles) {
    this.showScreen('endgame-screen');
    $('endgame-winner').textContent = winner === 'village' ? 'The Villagers Win!' : 'The Werewolves Win!';
    const list = $('endgame-roles');
    list.replaceChildren();
    for (const player of roles) {
      const item = document.createElement('li');
      item.textContent = player.name + ' — ' + (player.role === 'werewolf' ? 'Werewolf' : 'Villager');
      list.append(item);
    }
  }

  renderNight(state, { playerId, role, pack, casting, decoyPack }) {
    this.showScreen('night-screen');
    $('night-round').textContent = state.roundNumber;
    $('night-heading').textContent = 'Night has fallen';
    const wolf = role === 'werewolf';
    $('night-instruction').textContent = wolf ? 'Agree on one villager to eliminate.' : 'Cast your vote. The results will be revealed at dawn.';
    $('night-villager-controls').hidden = wolf;
    if (!wolf) {
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
    $('night-wolf-controls').hidden = !wolf;
    if (!wolf) return;
    const wolves = pack?.wolves || [];
    const votes = pack?.votes || [];
    const names = new Map(state.players.map(player => [player.id, player.name]));
    const list = $('night-wolves');
    list.replaceChildren();
    for (const member of wolves) {
      const vote = votes.find(item => item.voter_id === member.id);
      const item = document.createElement('li');
      item.textContent = member.name + (member.id === playerId ? ' (you)' : '') + ' — ' + (vote ? names.get(vote.target_id) || 'Unknown' : 'Not nominated');
      list.append(item);
    }
    const choices = $('night-targets');
    const selected = votes.find(item => item.voter_id === playerId)?.target_id;
    choices.replaceChildren();
    for (const player of state.players.filter(p => !p.eliminated_at && !wolves.some(w => w.id === p.id))) {
      const count = votes.filter(v => v.target_id === player.id).length;
      const percent = wolves.length ? Math.round(count * 100 / wolves.length) : 0;
      const label = document.createElement('label');
      label.className = 'night-choice';
      const bar = document.createElement('span');
      bar.className = 'night-bar';
      bar.style.width = percent + '%';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'night-target';
      radio.value = player.id;
      radio.checked = selected === player.id;
      radio.disabled = casting;
      const name = document.createElement('span');
      name.className = 'night-name';
      name.textContent = player.name;
      const share = document.createElement('span');
      share.className = 'night-percent';
      share.textContent = percent + '%';
      label.append(bar, radio, name, share);
      choices.append(label);
    }
    $('night-progress').textContent = votes.length + '/' + wolves.length + ' votes. Unanimous agreement ends the night.';
  }

  renderDay(state, { playerId, isHost, voting, myVote, casting, endingDiscussion }) {
    this.showScreen('day-screen');
    $('day-round').textContent = state.roundNumber;
    $('day-heading').textContent = voting ? 'Vote to banish' : 'Discuss';
    $('day-clock').hidden = voting;
    $('end-discussion').hidden = voting || !isHost;
    $('end-discussion').disabled = endingDiscussion;
    $('day-instruction').textContent = voting
      ? 'Choose one player. Your vote is final.'
      : 'Discuss who should be banished. Voting opens when the timer ends.';
    const active = state.players.filter(player => !player.eliminated_at);
    const voted = state.votes.filter(vote => vote.round_number === state.roundNumber).length;
    $('vote-controls').hidden = !voting || !!myVote || !active.some(player => player.id === playerId);
    const choices = $('vote-targets');
    const selected = choices.querySelector('input[name="vote-target"]:checked')?.value;
    choices.replaceChildren();
    for (const player of active.filter(player => player.id !== playerId)) {
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

  renderBanishment(name, eliminated, isHost) {
    this.showScreen('banishment-screen');
    $('elimination-heading').textContent = 'BANISHED';
    $('banished-name').textContent = eliminated ? 'You have been banished' : name;
    $('banishment-description').textContent = eliminated
      ? 'You are out of the game. You can watch, but cannot vote again.'
      : name + ' has been eliminated from the game.';
    $('dismiss-banishment').hidden = !isHost;
    $('banishment-waiting').hidden = isHost;
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
    $('wolf-minus').addEventListener('click', () => { void handlers.onWerewolves(-1); });
    $('wolf-plus').addEventListener('click', () => { void handlers.onWerewolves(1); });
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
    $('dismiss-dawn').addEventListener('click', () => { void handlers.onAdvance(); });
    $('finish-voting').addEventListener('click', () => { void handlers.onFinishVoting(); });
    $('dismiss-banishment').addEventListener('click', () => { void handlers.onDismissBanishment(); });
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
