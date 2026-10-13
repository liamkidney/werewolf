import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StateEngine } from '../src/state-engine.js';
import { RoleRegistry } from '../src/role-registry.js';
import { DEFAULT_RULES } from '../src/game-rules.js';

const t = Date.parse('2026-10-14T10:00:00Z');
const players = [
  { id: 'living', name: 'Alice', eliminated_at: null },
  { id: 'out', name: 'Bob', eliminated_at: '2026-10-14T09:00:00Z' }
];
const state = (phase, extras = {}) => ({
  id: 'game', phase, status: 'playing', step: null,
  phaseStartedAt: new Date(t).toISOString(), roundNumber: 2,
  players, ...extras
});

test('viewer state contains stage, public life status and timed presentation', () => {
  const engine = new StateEngine();
  const view = engine.view(state('results'), { playerId: 'living', now: t + 3000 });
  assert.equal(view.stage, 'results.reveal');
  assert.equal(view.playerStatus, 'active');
  assert.equal(view.presentation.screen, 'banishment-screen');
  assert.equal(view.presentation.progress, .5);
  assert.equal(Object.hasOwn(view, 'role'), false);
});

test('a completed timed phase has no pending presentation', () => {
  const view = new StateEngine().view(state('dawn'), {
    playerId: 'living', now: t + 12000
  });
  assert.equal(view.stage, 'dawn.complete');
  assert.equal(view.presentation, null);
});

test('eliminated players are never offered public gameplay presentations', () => {
  const view = new StateEngine().view(state('results'), {
    playerId: 'out', now: t + 3000
  });
  assert.equal(view.stage, 'eliminated');
  assert.equal(view.playerStatus, 'eliminated');
  assert.equal(view.presentation, null);
});

test('finished games retain status precedence and private roles stay out of snapshot', () => {
  const view = new StateEngine().view(state('dawn', { status: 'finished' }), {
    playerId: 'living', now: t + 3000
  });
  assert.equal(view.stage, 'finished');
  assert.equal(view.presentation, null);
});

test('RoleRegistry is extensible without subclassing a Player', () => {
  const definitions = {
    ...DEFAULT_RULES.roles,
    guardian: { label: 'Guardian', description: 'Protect one player.', team: 'village', actions: ['protect'] }
  };
  const registry = new RoleRegistry(definitions);
  assert.equal(registry.isOnTeam('guardian', 'village'), true);
  assert.equal(registry.label('guardian'), 'Guardian');
  assert.equal(registry.hasAction('guardian', 'protect'), true);
  assert.equal(registry.hasAction('guardian', 'kill'), false);
  assert.equal(registry.label('missing'), 'Unknown role');
});
