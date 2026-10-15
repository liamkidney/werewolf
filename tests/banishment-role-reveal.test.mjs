import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { GameState } from '../src/game-state.js';
import { GameController } from '../src/game-controller.js';
import { Screens } from '../src/screens.js';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('the role-reveal setting defaults off and is preserved in immutable state', () => {
  const initial = new GameState();
  assert.equal(initial.revealBanishedRole, false);
  assert.equal(initial.lastBanishedRole, null);
  const enabled = initial.with({ revealBanishedRole: true, lastBanishedRole: 'seer' });
  assert.equal(enabled.revealBanishedRole, true);
  assert.equal(enabled.lastBanishedRole, 'seer');
  assert.equal(initial.lastBanishedRole, null);
});

function timedBanishment(setting, role) {
  const calls = [];
  const controller = Object.create(GameController.prototype);
  controller.state = new GameState({
    status: 'playing', phase: 'results', lastBanishedId: 'victim',
    revealBanishedRole: setting, lastBanishedRole: role,
    players: [{ id: 'victim', name: 'Alice', eliminated_at: 'now' }]
  });
  controller.presentations = { show: (step, callback) => callback(step) };
  controller.screens = {
    renderBanishment: (...args) => calls.push(args)
  };
  controller.renderTimedPresentation({ screen: 'banishment-screen' });
  return calls[0];
}

test('the public reveal only receives a role when the host opted in', () => {
  assert.deepEqual(timedBanishment(false, 'werewolf').slice(0, 3),
    ['Alice', { screen: 'banishment-screen' }, null]);
  assert.deepEqual(timedBanishment(true, 'werewolf').slice(0, 3),
    ['Alice', { screen: 'banishment-screen' }, 'werewolf']);
  assert.equal(timedBanishment(true, null)[2], null);
});

test('banishment screen shows a role only when one is explicitly supplied', () => {
  const previous = globalThis.document;
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: false, textContent: '',
      classList: { remove() {} },
      querySelector: () => ({ hidden: false })
    });
    return nodes.get(id);
  };
  globalThis.document = { getElementById: node };
  try {
    const screens = Object.create(Screens.prototype);
    screens.showScreen = () => {};
    screens.updateTimedProgress = () => {};
    screens.renderBanishment('Alice', null, 'seer');
    assert.equal(node('banishment-role').textContent, 'Revealed as Seer');
    assert.equal(node('banishment-role').hidden, false);
    screens.renderBanishment('Bob');
    assert.equal(node('banishment-role').textContent, '');
    assert.equal(node('banishment-role').hidden, true);
    screens.showEliminated(false);
    assert.equal(node('banishment-role').hidden, true);
  } finally {
    globalThis.document = previous;
  }
});

test('host lobby and data layer use a single persisted setting', () => {
  const html = read('index.html');
  const controller = read('src/game-controller.js');
  const screens = read('src/screens.js');
  const repo = read('src/game-repository.js');
  const migration = read('supabase/migrations/20261015_reveal_banished_role.sql');
  assert.match(html, /id="reveal-banished-role" type="checkbox"/);
  assert.match(html, /id="banishment-role" class="banishment-role" hidden/);
  assert.match(controller, /setRevealBanishedRole\(this\.state\.id, this\.playerId, enabled\)/);
  assert.match(screens, /\$\('reveal-banished-role'\)\.checked = !!state\.revealBanishedRole/);
  assert.match(screens, /\$\('reveal-banished-role'\)\.disabled = !isHost/);
  assert.match(repo, /set_lobby_reveal_banished_role/);
  assert.match(repo, /last_banished_role/);
  assert.match(migration, /reveal_banished_role boolean not null default false/);
  assert.match(migration, /last_banished_role=\(case when v_game\.reveal_banished_role/);
  assert.match(migration, /elimination_reason='banished'/);
});
