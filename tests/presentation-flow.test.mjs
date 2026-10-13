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

test('dawn runs two consecutive six-second presentation substates', () => {
  const flow = new PresentationFlow();
  assert.equal(PRESENTATION_SEQUENCES.dawn.length, 2);
  assert.equal(flow.duration('dawn'), 12000);
  const suspense = flow.resolve(dawn(), { now: startedAt });
  assert.equal(suspense.stage, 'dawn.suspense');
  assert.equal(suspense.screen, 'suspense-screen');
  assert.equal(suspense.remainingMs, 6000);
  assert.equal(suspense.progress, 0);
  assert.equal(flow.resolve(dawn(), { now: startedAt + 5999 }).stage, 'dawn.suspense');

  const reveal = flow.resolve(dawn(), { now: startedAt + 6000 });
  assert.equal(reveal.stage, 'dawn.reveal');
  assert.equal(reveal.screen, 'dawn-screen');
  assert.equal(reveal.durationMs, 6000);
  assert.equal(reveal.progress, 0);
  assert.equal(flow.resolve(dawn(), { now: startedAt + 9000 }).progress, .5);
  assert.equal(flow.resolve(dawn(), { now: startedAt + 11999 }).stage, 'dawn.reveal');
  const complete = flow.resolve(dawn(), { now: startedAt + 12000 });
  assert.equal(complete.stage, 'dawn.complete');
  assert.equal(complete.screen, null);
});

test('automatic day start is available to living players only after both screens', () => {
  const engine = new StateEngine();
  const state = dawn();
  for (const seconds of [0, 5, 6, 11]) {
    assert.equal(engine.can(state, 'AUTO_START_DAY',
      { playerId: survivor.id, now: startedAt + seconds * 1000 }), false);
  }
  assert.equal(engine.can(state, 'AUTO_START_DAY',
    { playerId: survivor.id, now: startedAt + 12000 }), true);
  assert.equal(engine.can(state, 'AUTO_START_DAY',
    { playerId: victim.id, now: startedAt + 12000 }), false);
  assert.equal(engine.can(state, 'START_DAY',
    { playerId: survivor.id, isHost: true, now: startedAt + 12000 }), false);
  assert.equal(engine.can(dawn({ status: 'finished' }), 'AUTO_START_DAY',
    { playerId: survivor.id, now: startedAt + 12000 }), false);
});

test('a player receiving a late murder update can still run a local suspense window', () => {
  const flow = new PresentationFlow();
  const late = startedAt + 9000;
  assert.equal(flow.resolve(dawn(), { now: late + 1500, startedAt: late }).stage, 'dawn.suspense');
  assert.equal(flow.resolve(dawn(), { now: late + 6000, startedAt: late }).stage, 'dawn.reveal');
  assert.equal(flow.resolve(dawn(), { now: late + 12000, startedAt: late }).stage, 'dawn.complete');
});

test('a murder that finishes the game still has suspense and a full reveal', () => {
  const engine = new StateEngine();
  const state = dawn({ status: 'finished', winner: 'werewolves' });
  assert.equal(engine.stage(state, survivor.id, startedAt + 1000), 'finished');
  assert.equal(engine.presentation(state, { now: startedAt + 1000 }).stage, 'dawn.suspense');
  assert.equal(engine.presentation(state, { now: startedAt + 9000 }).stage, 'dawn.reveal');
  assert.equal(engine.presentation(state, { now: startedAt + 12000 }).stage, 'dawn.complete');
});

test('more suspense screens are added by configuration, not new controller timers', () => {
  const flow = new PresentationFlow({
    dawn: [
      { id: 'suspense', screen: 'suspense-screen', durationMs: 2000 },
      { id: 'second-suspense', screen: 'second-suspense-screen', durationMs: 3000 },
      { id: 'reveal', screen: 'dawn-screen', durationMs: 6000 }
    ]
  });
  assert.equal(flow.duration('dawn'), 11000);
  assert.equal(flow.resolve(dawn(), { now: startedAt + 1000 }).stage, 'dawn.suspense');
  const extra = flow.resolve(dawn(), { now: startedAt + 2500 });
  assert.equal(extra.stage, 'dawn.second-suspense');
  assert.equal(extra.progress, 1 / 6);
  assert.equal(flow.resolve(dawn(), { now: startedAt + 5000 }).stage, 'dawn.reveal');
  assert.equal(flow.resolve(dawn(), { now: startedAt + 11000 }).stage, 'dawn.complete');
});

test('missing timestamps do not trap the presentation state machine', () => {
  const flow = new PresentationFlow();
  assert.equal(flow.resolve(dawn({ phaseStartedAt: null })).stage, 'dawn.complete');
  assert.equal(flow.resolve({ phase: 'night' }), null);
});

test('timed sequences can be configured for other phases', () => {
  const flow = new PresentationFlow({
    results: [{ id: 'suspense', screen: 'results-suspense-screen', durationMs: 2500 }],
    reveal: [{ id: 'suspense', screen: 'roles-suspense-screen', durationMs: 1200 }]
  });
  const engine = new StateEngine(undefined, flow);
  const results = dawn({ phase: 'results', players: [survivor] });
  assert.equal(engine.stage(results, survivor.id, startedAt + 1000), 'results.suspense');
  assert.equal(engine.can(results, 'AUTO_START_NIGHT',
    { playerId: survivor.id, now: startedAt + 1000 }), false);
  assert.equal(engine.stage(results, survivor.id, startedAt + 2500), 'results.complete');
  assert.equal(engine.can(results, 'AUTO_START_NIGHT',
    { playerId: survivor.id, now: startedAt + 2500 }), true);

  const roles = { ...results, phase: 'reveal' };
  assert.equal(engine.stage(roles, survivor.id, startedAt + 1000), 'reveal.suspense');
  assert.equal(engine.can(roles, 'START_DAY',
    { playerId: survivor.id, isHost: true, now: startedAt + 1000 }), false);
  assert.equal(engine.can(roles, 'START_DAY',
    { playerId: survivor.id, isHost: true, now: startedAt + 1200 }), true);
});

test('banishment reveals the eliminated player for six seconds before automatic night', () => {
  const engine = new StateEngine();
  const results = dawn({
    phase: 'results',
    roundNumber: 3,
    lastBanishedId: 'victim',
    lastBanishedRound: 3
  });
  const first = engine.presentation(results, { now: startedAt });
  assert.equal(engine.presentationDuration('results'), 6000);
  assert.equal(first.stage, 'results.reveal');
  assert.equal(first.screen, 'banishment-screen');
  assert.equal(first.remainingMs, 6000);
  assert.equal(engine.can(results, 'AUTO_START_NIGHT', {
    playerId: survivor.id, now: startedAt + 5999
  }), false);
  const midpoint = engine.presentation(results, { now: startedAt + 3000 });
  assert.equal(midpoint.progress, .5);
  assert.equal(midpoint.remainingMs, 3000);
  assert.equal(engine.stage(results, survivor.id, startedAt + 6000), 'results.complete');
  assert.equal(engine.can(results, 'AUTO_START_NIGHT', {
    playerId: survivor.id, now: startedAt + 6000
  }), true);
  assert.equal(engine.can(results, 'AUTO_START_NIGHT', {
    playerId: victim.id, now: startedAt + 6000
  }), false);
  assert.equal(engine.can(results, 'START_NIGHT', {
    playerId: survivor.id, isHost: true, now: startedAt + 6000
  }), false);
  assert.equal(engine.can({ ...results, status: 'finished' }, 'AUTO_START_NIGHT', {
    playerId: survivor.id, now: startedAt + 6000
  }), false);
});
