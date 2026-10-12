import { PHASES } from './game-phases.js';

const $ = id => document.getElementById(id);

export class Screens {
  constructor() {
    this.form = $('new-game');
    this.nameInput = $('player-name');
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
    document.querySelector('.hero').hidden = true;
    this.form.hidden = true;
    for (const screen of ['lobby', 'role-screen', 'day-screen', 'marquee-screen', 'banishment-screen']) $(screen).hidden = screen !== id;
  }

  showLobby(gameId, isHost, inviteUrl) {
    this.showScreen('lobby');
    $('host-controls').hidden = !isHost;
    $('host-tools').hidden = !isHost;
    $('guest-intro').hidden = isHost;
    $('guest-waiting').hidden = isHost;
    $('lobby-code').textContent = 'Game ' + gameId.slice(0, 8).toUpperCase();
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
    $('villager-count').textContent = state.villagerCount;
    $('minimum-label').textContent = 'Minimum ' + (state.werewolfCount + 1);
    $('wolf-minus').disabled = starting || state.werewolfCount <= 1 || state.status !== 'lobby';
    $('wolf-plus').disabled = starting || state.werewolfCount >= 50 || state.status !== 'lobby';
    const valid = canStart;
    $('start-game').disabled = !isHost || !valid || starting;
    $('start-status').textContent = starting ? 'Assigning roles…'
      : state.status !== 'lobby' ? 'Game already started.'
      : !isHost ? 'Only the host can start the game.'
      : !valid ? 'Waiting for more players.' : 'Ready to start.';
    $('role-warning').hidden = valid;
    $('role-warning').textContent = valid ? '' : 'Add more players than werewolves before starting.';
  }

  showRole(role) {
    this.showScreen('role-screen');
    document.querySelector('.role-reminder').hidden = false;
    $('role-name').textContent = role ? (role === 'werewolf' ? 'Werewolf' : 'Villager') : 'Assigning roles…';
    $('role-description').textContent = role
      ? (role === 'werewolf' ? 'You are a werewolf. Keep your identity hidden.' : 'You are a villager. Find the werewolves.')
      : 'Please wait a moment.';
  }

  showSpectator() {
    $('role-name').textContent = 'Eliminated';
    $('role-description').textContent = 'You are watching the rest of the game.';
    document.querySelector('.role-reminder').hidden = true;
  }

  renderPhase(state, { isHost, advancing }) {
    const phase = PHASES[state.phase];
    const title = phase?.title || 'Game in progress';
    const description = phase?.description || 'Waiting for the host.';
    $('phase-panel').hidden = false;
    $('phase-round').textContent = 'ROUND ' + state.roundNumber;
    $('phase-title').textContent = title;
    $('phase-description').textContent = description;
    $('phase-host-controls').hidden = !isHost;
    $('phase-waiting').hidden = isHost;
    $('advance-phase').textContent = advancing ? 'Updating…' : phase?.action || 'Continue';
    $('advance-phase').disabled = advancing;
  }

  renderDay(state, { playerId, voting, myVote, casting }) {
    this.showScreen('day-screen');
    $('day-round').textContent = state.roundNumber;
    $('day-heading').textContent = voting ? 'Vote to banish' : 'Discuss';
    $('day-clock').hidden = voting;
    $('day-instruction').textContent = voting
      ? 'Choose one player. Your vote is final.'
      : 'Discuss who should be banished. Voting opens when the timer ends.';
    const active = state.players.filter(player => !player.eliminated_at);
    const voted = state.votes.filter(vote => vote.round_number === state.roundNumber).length;
    $('vote-controls').hidden = !voting || !!myVote || !active.some(player => player.id === playerId);
    const select = $('vote-target');
    const selected = select.value;
    select.replaceChildren(new Option('Choose a player', ''));
    for (const player of active.filter(player => player.id !== playerId)) select.add(new Option(player.name, player.id));
    if (active.some(player => player.id === selected && player.id !== playerId)) select.value = selected;
    $('cast-vote').disabled = casting || !select.value;
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
    $('finish-voting').hidden = !isHost;
    $('finish-voting').disabled = finishing;
    $('finish-voting').textContent = finishing ? 'Finishing…' : 'All Done';
  }

  renderBanishment(name, eliminated, isHost) {
    this.showScreen('banishment-screen');
    $('banished-name').textContent = eliminated ? 'You have been banished' : name;
    $('banishment-description').textContent = eliminated
      ? 'You are out of the game. You can watch, but cannot vote again.'
      : name + ' has been eliminated from the game.';
    $('dismiss-banishment').hidden = !isHost;
    $('banishment-waiting').hidden = isHost;
  }

  async renderQr(inviteUrl) {
    const { default: QRCode } = await import('https://esm.sh/qrcode@1.5.4');
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
    $('advance-phase').addEventListener('click', () => { void handlers.onAdvance(); });
    $('vote-target').addEventListener('change', () => { $('cast-vote').disabled = !$('vote-target').value; });
    $('cast-vote').addEventListener('click', () => { void handlers.onVote($('vote-target').value); });
    $('finish-voting').addEventListener('click', () => { void handlers.onFinishVoting(); });
    $('dismiss-banishment').addEventListener('click', () => { void handlers.onDismissBanishment(); });
    $('copy-link').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('invite-link').value);
        $('copy-link').textContent = 'Copied!';
      } catch { $('invite-link').select(); }
    });
    $('leave-lobby').addEventListener('click', () => { location.href = location.pathname; });
  }
}
