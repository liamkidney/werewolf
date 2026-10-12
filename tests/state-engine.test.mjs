import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StateEngine } from '../src/state-engine.js';

const engine = new StateEngine();
test('reveal requires host start day and results starts next night', () => {
  assert.deepEqual(engine.transition({ status: 'playing', phase: 'reveal', roundNumber: 1 }, { type: 'START_DAY' }), { phase: 'day', roundNumber: 1 });
  assert.deepEqual(engine.transition({ status: 'playing', phase: 'results', roundNumber: 1 }, { type: 'START_NIGHT' }), { phase: 'night', roundNumber: 2 });
  assert.deepEqual(engine.transition({ status: 'playing', phase: 'dawn', roundNumber: 2 }, { type: 'START_DAY' }), { phase: 'day', roundNumber: 2 });
  assert.throws(() => engine.transition({ status: 'playing', phase: 'day', roundNumber: 1 }, { type: 'START_NIGHT' }));
});
test('day discussion and voting are distinct derived steps', () => {
  const day = { status: 'playing', phase: 'day', phaseStartedAt: '2026-01-01T00:00:00Z', dayDurationSeconds: 120 };
  assert.equal(engine.step(day, Date.parse('2026-01-01T00:01:00Z')), 'discussion');
  assert.equal(engine.step(day, Date.parse('2026-01-01T00:02:00Z')), 'voting');
  assert.equal(engine.step({ ...day, discussionEndedAt: '2026-01-01T00:00:10Z' }), 'voting');
});
test('persisted step is authoritative even when the clock has expired', () => {
  const state = { status: 'playing', phase: 'day', step: 'discussion', phaseStartedAt: '2026-01-01T00:00:00Z', dayDurationSeconds: 120 };
  assert.equal(engine.step(state, Date.parse('2026-01-01T00:05:00Z')), 'discussion');
  assert.equal(engine.step({ ...state, step: 'voting' }, Date.parse('2026-01-01T00:00:01Z')), 'voting');
  assert.equal(engine.step({ ...state, phase: 'night', step: 'actions' }), 'actions');
});
test('independent actions require all active actors and unanimous werewolf consensus', () => {
  const action = engine.requiredNightActions([{ role: 'werewolf' }, { role: 'villager' }])[0];
  assert.equal(action.type, 'kill');
  const wolves = [{ id: 'a' }, { id: 'b' }, { id: 'c', eliminated_at: 'yesterday' }];
  assert.equal(engine.evaluateNightAction(action, wolves, [{ voter_id: 'a', target_id: 'x' }]).complete, false);
  assert.equal(engine.evaluateNightAction(action, wolves, [{ voter_id: 'a', target_id: 'x' }, { voter_id: 'b', target_id: 'y' }]).complete, false);
  assert.deepEqual(engine.evaluateNightAction(action, wolves, [{ voter_id: 'a', target_id: 'x' }, { voter_id: 'b', target_id: 'x' }]), { complete: true, targetId: 'x' });
});

test('complete two-round lifecycle preserves discussion before voting', () => {
  let state = { status: 'playing', phase: 'reveal', step: 'roles', roundNumber: 1 };
  assert.equal(engine.step(state), 'roles');
  state = { ...state, ...engine.transition(state, { type: 'START_DAY' }), step: 'discussion' };
  assert.equal(engine.step(state), 'discussion');
  state = { ...state, step: 'voting' };
  assert.equal(engine.step(state), 'voting');
  state = { ...state, phase: 'results', step: 'announcement' };
  assert.equal(engine.step(state), 'announcement');
  state = { ...state, ...engine.transition(state, { type: 'START_NIGHT' }), step: 'actions' };
  assert.equal(state.roundNumber, 2);
  assert.equal(engine.step(state), 'actions');
  state = { ...state, phase: 'dawn', step: 'murder_reveal' };
  assert.equal(engine.step(state), 'murder_reveal');
  state = { ...state, ...engine.transition(state, { type: 'START_DAY' }), step: 'discussion' };
  assert.equal(engine.step(state), 'discussion');
  state = { ...state, step: 'voting' };
  assert.equal(engine.step(state), 'voting');
  assert.throws(() => engine.transition(state, { type: 'START_NIGHT' }));
});
