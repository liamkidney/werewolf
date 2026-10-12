/** Browser identity and navigation only. Game authority remains in Supabase. */
export class GameSession {
  constructor({ storage = localStorage, url = location, browserHistory = history } = {}) {
    this.storage = storage;
    this.url = url;
    this.browserHistory = browserHistory;
    this.testFrame = new URLSearchParams(url.search).has('test_player');
    this.prefix = 'werewolf:' + (url.pathname.includes('/dev/') ? 'dev' : 'production') + ':';
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
  savePlayer(gameId, playerId) {
    this.storage.setItem(this.key('player:' + gameId), playerId);
  }
  enter(gameId) {
    if (this.testFrame) return;
    this.storage.setItem(this.key('active-game'), gameId);
    this.browserHistory.replaceState(null, '', this.url.pathname + this.url.hash);
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
