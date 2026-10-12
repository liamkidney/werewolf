const $ = id => document.getElementById(id);

export class Screens {
  constructor() {
    this.form = $('new-game');
    this.nameInput = $('player-name');
  }

  showError(message) {
    $('app-error').textContent = message;
    $('app-error').hidden = !message;
  }

  showConnectionError(message) {
    $('connection-error').textContent = message;
    $('connection-error').hidden = !message;
  }

  showScreen(id) {
    document.body.classList.add('light-screen');
    document.querySelector('.hero').hidden = true;
    this.form.hidden = true;
    for (const screen of ['lobby', 'role-screen']) $(screen).hidden = screen !== id;
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

  renderLobby(state, { isHost, playerId, starting, engine }) {
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
    const valid = engine.canStart(state);
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
    $('role-name').textContent = role ? (role === 'werewolf' ? 'Werewolf' : 'Villager') : 'Assigning roles…';
    $('role-description').textContent = role
      ? (role === 'werewolf' ? 'You are a werewolf. Keep your identity hidden.' : 'You are a villager. Find the werewolves.')
      : 'Please wait a moment.';
  }

  renderPhase(state, { isHost, advancing }) {
    const labels = {
      reveal: ['Roles assigned', 'Check your secret role. The host will begin the first night.'],
      night: ['Night falls', 'Everyone closes their eyes. Night actions will be added in a future iteration.'],
      day: ['Day breaks', 'Discuss what happened and who you suspect.'],
      voting: ['Time to vote', 'Discuss your choice. In-app voting will be added in a future iteration.'],
      results: ['Results', 'This round is complete. Vote resolution and eliminations are coming later.']
    };
    const next = {
      reveal: 'Begin night', night: 'Begin day', day: 'Begin voting',
      voting: 'Show results', results: 'Next night'
    };
    const [title, description] = labels[state.phase] || ['Game in progress', 'Waiting for the host.'];
    $('phase-panel').hidden = false;
    $('phase-round').textContent = 'ROUND ' + state.roundNumber;
    $('phase-title').textContent = title;
    $('phase-description').textContent = description;
    $('phase-host-controls').hidden = !isHost;
    $('phase-waiting').hidden = isHost;
    $('advance-phase').textContent = advancing ? 'Updating…' : next[state.phase] || 'Continue';
    $('advance-phase').disabled = advancing;
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
    $('copy-link').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('invite-link').value);
        $('copy-link').textContent = 'Copied!';
      } catch { $('invite-link').select(); }
    });
    $('leave-lobby').addEventListener('click', () => { location.href = location.pathname; });
  }
}
