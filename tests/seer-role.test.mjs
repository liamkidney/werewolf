import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameEngine } from '../src/game-engine.js';
import { StateEngine } from '../src/state-engine.js';
import { DEFAULT_RULES } from '../src/game-rules.js';
import { ROLES } from '../src/role-registry.js';
import { PresentationFlow } from '../src/presentation-flow.js';

const engine = new GameEngine();
const states = new StateEngine();

const lobby = (seerCount, werewolfCount = 1, players = 6) => ({
  id: 'test', status: 'lobby', seerCount, werewolfCount,
  players: Array.from({ length: players }, (_, i) => ({ id: String(i) }))
});

test('new games can start with one Seer and an ordinary villager', () => {
  const state = lobby(1, 1, 3);
  assert.equal(engine.canStart(state), true);
  const roles = engine.assignRoles(state, () => 0);
  assert.equal(roles.filter(player => player.role === 'werewolf').length, 1);
  assert.equal(roles.filter(player => player.role === 'seer').length, 1);
  assert.equal(roles.filter(player => player.role === 'villager').length, 1);
});

test('zero Seers preserves the existing production role assignment', () => {
  const state = lobby(0, 1, 5);
  assert.equal(engine.canStart(state), true);
  assert.equal(engine.assignRoles(state, () => 0).filter(player => player.role === 'seer').length, 0);
  assert.equal(engine.assignRoles(state, () => 0).filter(player => player.role === 'villager').length, 4);
});

test('the Seer count is configurable, including multiple Seers', () => {
  const state = lobby(2, 2, 7);
  const roles = engine.assignRoles(state, () => 0);
  assert.equal(roles.filter(player => player.role === 'werewolf').length, 2);
  assert.equal(roles.filter(player => player.role === 'seer').length, 2);
  assert.equal(roles.filter(player => player.role === 'villager').length, 3);
  assert.equal(engine.nextSeerCount(state, -2), 0);
  assert.equal(engine.nextSeerCount(state, 1), 3);
});

test('at least one ordinary villager must remain on starting', () => {
  assert.equal(engine.canStart(lobby(1, 1, 2)), false);
  assert.equal(engine.canStart(lobby(2, 1, 3)), false);
  assert.equal(engine.canStart(lobby(50, 1, 6)), false);
  assert.equal(engine.canStart(lobby(0, 1, 3)), true);
});

test('Seer can only investigate during an active night', () => {
  const night = { id:'test', status:'playing', phase:'night', roundNumber:1, players:[
    { id:'seer', eliminated_at: null }, { id:'wolf', eliminated_at: null }
  ] };
  assert.equal(states.can(night, 'CAST_SEER_INVESTIGATION', { playerId:'seer', role:'seer' }), true);
  assert.equal(states.can(night, 'CAST_SEER_INVESTIGATION', { playerId:'wolf', role:'werewolf' }), false);
  assert.equal(states.can({ ...night, phase:'day' }, 'CAST_SEER_INVESTIGATION', { playerId:'seer', role:'seer' }), false);
  assert.equal(states.can({ ...night, players:[{id:'seer',eliminated_at:'now'}] },
    'CAST_SEER_INVESTIGATION', { playerId:'seer', role:'seer' }), false);
});

test('night actions and village alignment are role metadata', () => {
  assert.equal(ROLES.hasAction('werewolf', 'kill'), true);
  assert.equal(ROLES.hasAction('villager', 'decoy'), true);
  assert.equal(ROLES.hasAction('seer', 'inspect'), true);
  assert.equal(ROLES.hasAction('seer', 'kill'), false);
  assert.equal(ROLES.isOnTeam('seer', 'village'), true);
  assert.equal(ROLES.isOnTeam('werewolf', 'village'), false);
  assert.equal(DEFAULT_RULES.nightActions.inspect.consensus, 'individual');
  assert.equal(DEFAULT_RULES.nightActions.kill.consensus, 'unanimous');
});

test('Seer result is a private six-second timed presentation', () => {
  const flow = new PresentationFlow();
  const now = Date.parse('2026-10-13T22:00:00Z');
  assert.equal(flow.duration('seer-investigation'), 6000);
  const state = { phase:'seer-investigation', phaseStartedAt:new Date(now).toISOString() };
  const midway = flow.resolve(state, { now:now+3000 });
  assert.equal(midway.stage, 'seer-investigation.result');
  assert.equal(midway.screen, 'seer-result-screen');
  assert.equal(midway.progress, .5);
  assert.equal(flow.resolve(state, { now:now+6000 }).screen, null);
});
