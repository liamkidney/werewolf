import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameEngine } from '../src/game-engine.js';
import { GameState } from '../src/game-state.js';
import { StateEngine } from '../src/state-engine.js';
import { ROLES } from '../src/role-registry.js';
import { DEFAULT_RULES } from '../src/game-rules.js';
import { workflowStatus } from '../src/workflow-status.js';
import { GameController } from '../src/game-controller.js';

const engine = new GameEngine();
const states = new StateEngine();
function lobby(bodyguards, players = 7, seers = 1, wolves = 1) {
  return new GameState({ id: 'game', bodyguardCount: bodyguards,
    seerCount: seers, werewolfCount: wolves, status: 'lobby',
    players: Array.from({ length: players }, (_, i) => ({ id: String(i) })) });
}

test('Bodyguard declares village alignment and one protective night action', () => {
  assert.equal(ROLES.label('bodyguard'), 'Bodyguard');
  assert.equal(ROLES.isOnTeam('bodyguard', 'village'), true);
  assert.equal(ROLES.hasAction('bodyguard', 'protect'), true);
  assert.equal(ROLES.hasAction('bodyguard', 'kill'), false);
  assert.equal(DEFAULT_RULES.nightActions.protect.effect, 'prevent_elimination');
});

test('role allocation preserves counts and an ordinary villager', () => {
  const state = lobby(2);
  assert.equal(engine.canStart(state), true);
  const result = engine.assignRoles(state, () => 0);
  assert.equal(result.filter(x => x.role === 'bodyguard').length, 2);
  assert.equal(result.filter(x => x.role === 'villager').length, 3);
  assert.equal(result.filter(x => x.role === 'seer').length, 1);
  assert.equal(result.filter(x => x.role === 'werewolf').length, 1);
  assert.equal(engine.canStart(lobby(2, 4)), false);
  assert.equal(engine.canStart(lobby(0, 3)), true);
  assert.equal(engine.nextBodyguardCount(lobby(0), -1), 0);
  assert.equal(engine.nextBodyguardCount(lobby(0), 2), 2);
});

test('Bodyguard can only protect while alive and during the night', () => {
  const night = { status: 'playing', phase: 'night', players: [{ id: 'g', eliminated_at: null }] };
  assert.equal(states.can(night, 'CAST_PROTECTION', { playerId: 'g', role: 'bodyguard' }), true);
  assert.equal(states.can(night, 'CAST_PROTECTION', { playerId: 'g', role: 'seer' }), false);
  assert.equal(states.can({ ...night, phase: 'day' }, 'CAST_PROTECTION',
    { playerId: 'g', role: 'bodyguard' }), false);
  assert.equal(states.can({ ...night, players: [{ id: 'g', eliminated_at: 'now' }] },
    'CAST_PROTECTION', { playerId: 'g', role: 'bodyguard' }), false);
});

test('Bodyguard workflow shows private completed-state guidance', () => {
  const state = { status: 'playing', phase: 'night', roundNumber: 3, players: [{ id: 'g' }] };
  assert.equal(workflowStatus(state, { playerId: 'g', role: 'bodyguard' }).title, 'Protect a player');
  assert.equal(workflowStatus(state, { playerId: 'g', role: 'bodyguard',
    bodyguardPack: { myProtection: 'g' } }).title, 'Your protection is recorded');
});

test('Bodyguard submission stays in controller orchestration, not game transition logic', async () => {
  const calls = [];
  const controller = Object.create(GameController.prototype);
  controller.state = { id: 'game', status: 'playing', phase: 'night', roundNumber: 2 };
  controller.playerId = 'guard';
  controller.bodyguardPack = { lastProtectionTargetId: 'last' };
  controller.protectionCasting = false;
  controller.can = () => true;
  controller.showActionError = () => {};
  controller.requestRefresh = () => calls.push('refresh');
  controller.repository = { castProtection: async (...args) => { calls.push(args); } };
  await controller.castProtection('last');
  assert.deepEqual(calls, []);
  await controller.castProtection('guard');
  assert.deepEqual(calls, [['game', 2, 'guard', 'guard'], 'refresh', 'refresh']);
});

test('dawn without murder has an explicit outcome and never invents a victim', () => {
  const state = new GameState({ lastNightOutcome: 'protected', lastMurderedId: null });
  assert.equal(state.lastNightOutcome, 'protected');
  const controllerSource = readFileSync(new URL('../src/game-controller.js', import.meta.url), 'utf8');
  const screensSource = readFileSync(new URL('../src/screens.js', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../supabase/migrations/20261018_add_bodyguard.sql', import.meta.url), 'utf8');
  assert.match(controllerSource, /state\.lastNightOutcome/);
  assert.match(screensSource, /Nobody was murdered/);
  assert.match(migration, /last_murdered_id=case when v_protected then null/);
  assert.match(migration, /v_guard_votes<>v_guards/);
  assert.match(migration, /round_number=p_round-1/);
});

test('Bodyguard count and protection form are available in the lobby and at night', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['bodyguard-count', 'bodyguard-minus', 'bodyguard-plus',
    'night-bodyguard-controls', 'bodyguard-targets', 'bodyguard-progress']) {
    assert.ok(html.includes('id="' + id + '"'));
  }
});
