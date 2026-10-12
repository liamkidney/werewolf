import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameState } from '../src/game-state.js';
import { GameEngine } from '../src/game-engine.js';
import { PHASES } from '../src/game-phases.js';

test('state snapshots and nested players are immutable', () => {
  const state = new GameState({ id: 'g', players: [{ id: 'p', name: 'A' }] });
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.players));
  assert.ok(Object.isFrozen(state.players[0]));
  const next = state.with({ status: 'playing' });
  assert.equal(state.status, 'lobby');
  assert.equal(next.status, 'playing');
  assert.equal(next.players[0].name, 'A');
});

test('only host-controlled phases can advance manually', () => {
  const engine = new GameEngine();
  for (const [phase, expected, round] of [['reveal', 'day', 3], ['results', 'night', 4]]) {
    const result = engine.nextPhase({ status: 'playing', phase, roundNumber: 3 });
    assert.ok(PHASES[result.phase]);
    assert.equal(result.phase, expected);
    assert.equal(result.roundNumber, round);
  }
  assert.throws(() => engine.nextPhase({ status: 'playing', phase: 'day', roundNumber: 1 }), /automatically/);
  for (const phase of ['night', 'voting', 'invalid']) {
    assert.throws(() => engine.nextPhase({ status: 'playing', phase, roundNumber: 1 }), /not permitted/);
  }
});

test('cannot start with insufficient players or zero werewolves', () => {
  const engine = new GameEngine();
  assert.equal(engine.canStart(new GameState()), false);
  assert.equal(engine.canStart(new GameState({ werewolfCount: 0, players: [{ id: 'a' }, { id: 'b' }] })), false);
  assert.equal(engine.canStart(new GameState({ werewolfCount: 2, players: [{ id: 'a' }, { id: 'b' }] })), false);
});

test('invalid random indexes fail without changing input', () => {
  const engine = new GameEngine();
  const state = new GameState({ id: 'g', werewolfCount: 1, players: [{ id: 'a' }, { id: 'b' }] });
  assert.throws(() => engine.assignRoles(state, () => 2), /Invalid random index/);
  assert.equal(state.players[0].id, 'a');
});
