import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PresentationFlow, PRESENTATION_SEQUENCES } from '../src/presentation-flow.js';
import { StateEngine } from '../src/state-engine.js';

const startedAt = Date.parse('2026-10-13T21:00:00Z');
const victim = { id: 'victim', eliminated_at: '2026-10-13T21:00:00Z', elimination_reason: 'murdered' };
const survivor = { id: 'survivor', eliminated_at: null };
const dawn = (overrides = {}) => ({
  id: 'game', phase: 'dawn', status: 'playing', roundNumber: 2,
  phaseStartedAt: new Date(startedAt).toISOString(), lastMurderedId: victim.id,
  players: [victim, survivor], ...overrides
});

test('dawn has explicit suspense and reveal substates with timed progress', () => {
  const flow = new PresentationFlow();
  assert.equal(PRESENTATION_SEQUENCES.dawn.length, 1);
  assert.equal(flow.duration('dawn'), 6000);
  const first = flow.resolve(dawn(), { now: startedAt });
  assert.equal(first.stage, 'dawn.suspense');
  assert.equal(first.screen, 'suspense-screen');
  assert.equal(first.remainingMs, 6000);
  assert.equal(first.progress, 0);
  const midway = flow.resolve(dawn(), { now: startedAt + 3000 });
  assert.equal(midway.progress, .5);
  assert.equal(midway.remainingMs, 3000);
  assert.equal(flow.resolve(dawn(), { now: startedAt + 5999 }).stage, 'dawn.suspense');
  assert.equal(flow.resolve(dawn(), { now: startedAt + 6000 }).stage, 'dawn.reveal');
});

test('state engine uses presentation substate to gate the host starting the day', () => {
  const engine = new StateEngine();
  const state = dawn();
  assert.equal(engine.stage(state, survivor.id, startedAt + 1000), 'dawn.suspense');
  assert.equal(engine.can(state, 'START_DAY', { playerId: survivor.id, isHost: true, now: startedAt + 1000 }), false);
  assert.equal(engine.stage(state, survivor.id, startedAt + 6000), 'dawn.reveal');
  assert.equal(engine.can(state, 'START_DAY', { playerId: survivor.id, isHost: true, now: startedAt + 6000 }), true);
  assert.equal(engine.can(state, 'START_DAY', { playerId: survivor.id, isHost: false, now: startedAt + 6000 }), false);
  assert.equal(engine.stage(state, victim.id, startedAt + 1000), 'eliminated');
});

test('a murdered player can receive the full suspense duration despite late state delivery', () => {
  const engine = new StateEngine();
  const late = startedAt + 9000;
  const step = engine.presentation(dawn(), { now: late + 1500, startedAt: late });
  assert.equal(step.stage, 'dawn.suspense');
  assert.equal(step.remainingMs, 4500);
  assert.equal(engine.presentation(dawn(), { now: late + 6000, startedAt: late }).stage, 'dawn.reveal');
});

test('a finished game can still resolve dawn suspense before final credits', () => {
  const engine = new StateEngine();
  const finished = dawn({ status: 'finished', winner: 'werewolves' });
  assert.equal(engine.stage(finished, survivor.id, startedAt + 1000), 'finished');
  assert.equal(engine.presentation(finished, { now: startedAt + 1000 }).stage, 'dawn.suspense');
  assert.equal(engine.presentation(finished, { now: startedAt + 6000 }).stage, 'dawn.reveal');
});

test('adding a second suspense screen requires configuration only', () => {
  const flow = new PresentationFlow({
    dawn: [
      { id: 'suspense', screen: 'suspense-screen', durationMs: 2000 },
      { id: 'second-suspense', screen: 'second-suspense-screen', durationMs: 3000 }
    ]
  });
  assert.equal(flow.resolve(dawn(), { now: startedAt + 1000 }).stage, 'dawn.suspense');
  const second = flow.resolve(dawn(), { now: startedAt + 2500 });
  assert.equal(second.stage, 'dawn.second-suspense');
  assert.equal(second.screen, 'second-suspense-screen');
  assert.equal(second.progress, 1 / 6);
  assert.equal(flow.duration('dawn'), 5000);
  assert.equal(flow.resolve(dawn(), { now: startedAt + 5000 }).stage, 'dawn.reveal');
});

test('bad or missing timestamps do not trap players on suspense', () => {
  const flow = new PresentationFlow();
  assert.equal(flow.resolve(dawn({ phaseStartedAt: null })).stage, 'dawn.reveal');
  assert.equal(flow.resolve({ phase: 'night' }), null);
});
