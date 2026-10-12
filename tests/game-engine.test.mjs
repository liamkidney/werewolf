import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GameEngine } from '../src/game-engine.js';
const engine = new GameEngine();

test('phases advance in order and increment round after results', () => {
  let state = { status: 'playing', phase: 'reveal', roundNumber: 1 };
  state = { ...state, ...engine.nextPhase(state) };
  assert.equal(state.phase, 'day');
  assert.equal(state.roundNumber, 1);
  assert.throws(() => engine.nextPhase(state), /automatically/);
  state = { ...state, phase: 'results' };
  state = { ...state, ...engine.nextPhase(state) };
  assert.equal(state.phase, 'night');
  assert.equal(state.roundNumber, 2);
});

test('phases cannot advance before game starts', () => {
  assert.throws(() => engine.nextPhase({ status: 'lobby', phase: 'reveal', roundNumber: 1 }));
});

test('role assignment preserves player count and werewolf count', () => {
  const state = { id: 'game', status: 'lobby', werewolfCount: 2, players: [
    { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }
  ] };
  const roles = engine.assignRoles(state, () => 0);
  assert.equal(roles.length, 4);
  assert.equal(roles.filter(role => role.role === 'werewolf').length, 2);
  assert.deepEqual(state.players.map(player => player.id), ['a', 'b', 'c', 'd']);
});


test('six-player game supports one werewolf', () => {
  const state = { id: 'game', status: 'lobby', werewolfCount: 1, players: Array.from({ length: 6 }, (_, i) => ({ id: String(i) })) };
  assert.equal(engine.canStart(state), true);
  assert.equal(engine.assignRoles(state, () => 0).filter(role => role.role === 'werewolf').length, 1);
});

test('start requires at least three players and more players than werewolves', () => {
  const state = { status: 'lobby', werewolfCount: 1, players: [{ id: 'a' }, { id: 'b' }] };
  assert.equal(engine.canStart(state), false);
  assert.equal(engine.canStart({ ...state, players: [...state.players, { id: 'c' }] }), true);
  assert.equal(engine.canStart({ ...state, werewolfCount: 3, players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }), false);
});
