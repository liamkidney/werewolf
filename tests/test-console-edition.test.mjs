import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gameUrl } from '../src/test-console-urls.js';

test('classic game link and all test-frame parameters remain unchanged', () => {
  assert.equal(gameUrl(), './');
  assert.equal(gameUrl({ gameId: 'abc' }), './?game=abc');
  assert.equal(gameUrl({ gameId: 'abc', playerId: 'player-1', isHost: true }),
    './?game=abc&test_player=player-1&test_host=1');
  assert.equal(gameUrl({ gameId: 'abc', playerId: 'player-2' }),
    './?game=abc&test_player=player-2&test_host=0');
});

test('Queerwolf theme propagates to standalone game and all six frames', () => {
  assert.equal(gameUrl({ edition: 'pride' }), './?theme=pride');
  assert.equal(gameUrl({ gameId: 'abc', edition: 'pride' }),
    './?game=abc&theme=pride');
  assert.equal(gameUrl({ gameId: 'abc', edition: 'pride', playerId: 'wolf', isHost: true }),
    './?game=abc&theme=pride&test_player=wolf&test_host=1');
  assert.equal(gameUrl({ gameId: 'abc', edition: 'pride', playerId: 'seer' }),
    './?game=abc&theme=pride&test_player=seer&test_host=0');
});

test('test-frame URLs reject missing game IDs and encode player identity', () => {
  assert.throws(() => gameUrl({ playerId: 'player-1' }), /game ID/);
  assert.equal(gameUrl({ edition: 'pride', gameId: 'game id', playerId: 'Alice & Bob' }),
    './?game=game+id&theme=pride&test_player=Alice+%26+Bob&test_host=0');
  assert.equal(gameUrl({ edition: 'unknown', gameId: 'abc' }), './?game=abc');
});

test('test console exposes edition switch and applies selection to frames', () => {
  const html = readFileSync(new URL('../test.html', import.meta.url), 'utf8');
  assert.match(html, /<select id="edition"/);
  assert.match(html, /<option value="classic">Classic Werewolf<\/option>/);
  assert.match(html, /<option value="pride">Queerwolf · Pride After Dark<\/option>/);
  assert.match(html, /edition\.value=editionFromSearch\(location\.search\)/);
  assert.match(html, /frame\.src=gameUrl\(\{gameId,edition:selectedEdition,playerId:ids\[i\],isHost:i===0\}\)/);
  assert.match(html, /gameLink\.href=gameUrl\(\{gameId,edition:selectedEdition\}\)/);
  assert.match(html, /edition\.addEventListener\('change',updateEdition\)/);
});
