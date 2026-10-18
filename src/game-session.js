/** Browser identity and navigation only. Game authority remains in Supabase. */
export class GameSession {
  constructor({ storage = localStorage, url = location, browserHistory = history } = {}) {
    this.storage = storage;
    this.url = url;
    this.browserHistory = browserHistory;
    this.testFrame = new URLSearchParams(url.search).has('test_player');
    const environment = url.pathname.includes('/dev/') ? 'dev' : 'production';
    this.prefix = 'werewolf:' + environment + ':';
  }

  key(suffix) { return this.prefix + suffix; }
  get name() { return this.storage.getItem(this.key('name')) || ''; }
  set name(value) { this.storage.setItem(this.key('name'), value); }
  get activeGame() { return this.storage.getItem(this.key('active-game')); }
  get requestedGame() {
    const params = new URLSearchParams(this.url.search);
    return params.get('game') || (params.has('resume') && !this.testFrame ? this.activeGame : null);
  }
  playerId(gameId) { return this.storage.getItem(this.key('player:' + gameId)); }
  playerGeneration(gameId) {
    const value = Number(this.storage.getItem(this.key('generation:' + gameId)) || 0);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }
  savePlayer(gameId, playerId, generation = 0) {
    this.storage.setItem(this.key('player:' + gameId), playerId);
    this.storage.setItem(this.key('generation:' + gameId), String(generation));
  }
  get recoveryToken() {
    return new URLSearchParams(this.url.search).get('recover');
  }
  cleanUrl() {
    return this.url.pathname + this.url.hash;
  }
  clearRecoveryUrl() { this.browserHistory.replaceState(null, '', this.cleanUrl()); }
  recoveryLink(token) {
    const url = new URL(this.url.pathname, this.url.href);
    url.searchParams.set('recover', token);
    return url.href;
  }
  enter(gameId) {
    if (this.testFrame) return;
    this.storage.setItem(this.key('active-game'), gameId);
    this.browserHistory.replaceState(null, '', this.cleanUrl());
  }
  clearActive(gameId) {
    if (this.activeGame === gameId) this.storage.removeItem(this.key('active-game'));
  }
  invitation(gameId) {
    const url = new URL(this.url.pathname, this.url.href);
    url.searchParams.set('game', gameId);
    return url.href;
  }
}
