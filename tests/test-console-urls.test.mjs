import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gameUrl } from '../src/test-console-urls.js';

test('standalone game link and all six test frames use canonical URLs', () => {
  assert.equal(gameUrl(), './');
  assert.equal(gameUrl({ gameId: 'abc' }), './?game=abc');
  assert.equal(gameUrl({ gameId: 'abc', playerId: 'player-1', isHost: true }),
    './?game=abc&test_player=player-1&test_host=1');
  assert.equal(gameUrl({ gameId: 'abc', playerId: 'player-2' }),
    './?game=abc&test_player=player-2&test_host=0');
});

test('test frame URLs require game IDs and safely encode names', () => {
  assert.throws(() => gameUrl({ playerId: 'player-1' }), /game ID/);
  assert.equal(gameUrl({ gameId: 'game id', playerId: 'Alice & Bob' }),
    './?game=game+id&test_player=Alice+%26+Bob&test_host=0');
});

test('test console creates six players without an edition selector', () => {
  const html = readFileSync(new URL('../test.html', import.meta.url), 'utf8');
  assert.match(html, /Create six-player game/);
  assert.ok(html.includes('frame.src=gameUrl({gameId,playerId:ids[i],isHost:i===0})'));
  assert.ok(html.includes('gameLink.href=gameUrl({gameId})'));
  assert.doesNotMatch(html, /id="edition"/);
});

test('app loads a single stylesheet and presentation', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.ok(html.includes('href="./styles.css"'));
  assert.doesNotMatch(html, /edition-switch|edition-kicker|data-edition/);
  assert.doesNotMatch(app, /applyEdition|editionFromSearch/);
});
