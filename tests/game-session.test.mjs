import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/game-session.js';

const fixture = (path = '/werewolf/dev/', search = '') => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const url = new URL('https://example.com' + path + search);
  let navigation;
  const session = new GameSession({
    storage,
    url,
    browserHistory: { replaceState: (_state, _title, target) => { navigation = target; } }
  });
  return { session, values, get navigation() { return navigation; } };
};

test('home starts fresh and resume is explicit', () => {
  const { session } = fixture();
  session.enter('abc');
  assert.equal(session.requestedGame, null);
  assert.equal(session.activeGame, 'abc');
  assert.equal(fixture('/werewolf/dev/', '?resume=1').session.requestedGame, null);
});

test('enter keeps the home URL clean and invitation retains the game ID', () => {
  const context = fixture();
  context.session.enter('abc');
  assert.equal(context.navigation, '/werewolf/dev/');
  assert.equal(context.session.invitation('abc'), 'https://example.com/werewolf/dev/?game=abc');
});

test('dev and production identities use separate namespaces', () => {
  const dev = fixture().session;
  const prod = fixture('/werewolf/').session;
  assert.notEqual(dev.key('player:abc'), prod.key('player:abc'));
});

test('test frames do not persist an active game or alter the URL', () => {
  const context = fixture('/werewolf/dev/', '?game=abc&test_player=p1');
  context.session.enter('abc');
  assert.equal(context.session.activeGame, null);
  assert.equal(context.navigation, undefined);
});

test('clearing a finished game does not remove another active game', () => {
  const { session } = fixture();
  session.enter('abc');
  session.clearActive('other');
  assert.equal(session.activeGame, 'abc');
  session.clearActive('abc');
  assert.equal(session.activeGame, null);
});
