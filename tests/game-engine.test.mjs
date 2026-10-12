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
