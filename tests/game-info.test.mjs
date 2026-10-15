import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { getGameInfo } from '../src/game-info.js';

const state = {
  status: 'playing', werewolfCount: 2, seerCount: 1,
  players: [
    { id: 'a', name: 'Alice', eliminated_at: null, elimination_reason: null },
    { id: 'b', name: 'Bob', eliminated_at: '2026-10-15', elimination_reason: 'murdered' },
    { id: 'c', name: 'Chris', eliminated_at: '2026-10-16', elimination_reason: 'banished' },
    { id: 'd', name: 'David', eliminated_at: null, elimination_reason: null },
    { id: 'e', name: 'Evan', eliminated_at: null, elimination_reason: null },
    { id: 'f', name: 'Fran', eliminated_at: null, elimination_reason: null }
  ]
};

test('initial role counts include all starting players, even the eliminated', () => {
  const info = getGameInfo(state);
  assert.equal(info.total, 6);
  assert.deepEqual(info.roles, [
    { role: 'villager', count: 3 },
    { role: 'seer', count: 1 },
    { role: 'werewolf', count: 2 }
  ]);
  assert.deepEqual(info.banished, ['Chris']);
  assert.deepEqual(info.murdered, ['Bob']);
});

test('summary never exposes individual player roles', () => {
  const withRoles = {
    ...state,
    players: state.players.map(player => ({ ...player, role: 'werewolf' }))
  };
  assert.deepEqual(getGameInfo(withRoles), getGameInfo(state));
});

test('no eliminations and no seers have sensible results', () => {
  const info = getGameInfo({ werewolfCount: 1, seerCount: 0,
    players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
  assert.deepEqual(info.roles.map(role => role.count), [2, 0, 1]);
  assert.deepEqual(info.banished, []);
  assert.deepEqual(info.murdered, []);
});

test('information button is linked to a dialog and uses the existing state', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const controller = readFileSync(new URL('../src/game-controller.js', import.meta.url), 'utf8');
  const screens = readFileSync(new URL('../src/screens.js', import.meta.url), 'utf8');
  for (const id of ['game-info-button', 'game-info-dialog', 'game-info-roles',
    'game-info-banished', 'game-info-murdered', 'game-info-close']) {
    assert.ok(html.includes('id="' + id + '"'), id + ' missing');
  }
  assert.ok(controller.includes('if (!this.eliminated) this.screens.renderGameInfo(state)'));
  assert.ok(screens.includes("state.status !== 'playing' && state.status !== 'finished'"));
  assert.ok(screens.includes('infoDialog.showModal()'));
});

test('information panel stays understated and uses the gothic game palette', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const pride = readFileSync(new URL('../pride.css', import.meta.url), 'utf8');
  const screens = readFileSync(new URL('../src/screens.js', import.meta.url), 'utf8');
  assert.ok(css.includes('background:rgba(11,23,35,.14)'));
  assert.ok(css.includes('--info-bg:#111821'));
  assert.ok(css.includes('--info-ink:#f0ece4'));
  assert.ok(css.includes('border:1px solid var(--info-accent)'));
  assert.ok(!css.includes('/* Persistent game information: distinct from primary gameplay actions. */'));
  assert.ok(pride.includes('--info-bg:#1b1031'));
  assert.ok(screens.includes("role === 'werewolf' ? 'Werewolves'"));
  assert.ok(screens.includes("item.append(icon, name, number)"));
});
