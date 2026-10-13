import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PresentationController } from '../src/presentation-controller.js';
import { StateEngine } from '../src/state-engine.js';

function fixture() {
  const timers = new Map();
  let nextId = 0;
  let time = Date.parse('2026-10-13T20:00:00Z');
  let refreshes = 0;
  const coordinator = new PresentationController({
    stateEngine: new StateEngine(),
    requestRefresh: () => refreshes++,
    now: () => time,
    schedule: (fn, delay) => {
      const id = ++nextId;
      timers.set(id, { fn: () => { timers.delete(id); fn(); }, delay });
      return id;
    },
    cancel: id => timers.delete(id)
  });
  return {
    coordinator, timers,
    now: () => time,
    tick: ms => { time += ms; },
    refreshes: () => refreshes
  };
}

test('Seer result shows immediately and expires after six seconds', () => {
  const f = fixture();
  f.coordinator.startSeerResult({
    targetName: 'Alice', isWerewolf: true
  });
  assert.equal(f.coordinator.seerResult.targetName, 'Alice');
  assert.equal(f.coordinator.currentSeerStep().stage, 'seer-investigation.result');
  f.tick(3000);
  assert.equal(f.coordinator.currentSeerStep().progress, 0.5);
  f.tick(3000);
  assert.equal(f.coordinator.currentSeerStep(), null);
  assert.equal(f.coordinator.seerResult, null);
});

test('late murder update still gives the victim a full suspense interval', () => {
  const f = fixture();
  const state = {
    id: 'game', phase: 'dawn', lastMurderedId: 'victim',
    phaseStartedAt: new Date(f.now() - 9000).toISOString()
  };
  const first = f.coordinator.victimSuspenseStep(state, 'victim');
  assert.equal(first.stage, 'dawn.suspense');
  assert.equal(first.remainingMs, 6000);
  f.tick(4500);
  const advanced = { ...state, phase: 'day' };
  assert.equal(f.coordinator.victimSuspenseStep(advanced, 'victim').remainingMs, 1500);
  f.tick(1500);
  assert.equal(f.coordinator.victimSuspenseStep(advanced, 'victim'), null);
});

test('victim farewell is held for four seconds before credits', () => {
  const f = fixture();
  const state = { id: 'game', phase: 'dawn', lastMurderedId: 'victim' };
  f.coordinator.victimSuspenseStep(state, 'victim');
  f.tick(6000);
  assert.equal(f.coordinator.holdVictimFarewell(state, 'victim'), true);
  assert.equal(f.timers.size, 1);
  f.tick(3999);
  assert.equal(f.coordinator.holdVictimFarewell(state, 'victim'), true);
  f.tick(1);
  assert.equal(f.coordinator.holdVictimFarewell(state, 'victim'), false);
  f.coordinator.stopHold();
  assert.equal(f.timers.size, 0);
});

test('step timer is replaced without accumulating callbacks', () => {
  const f = fixture();
  let rendered = 0;
  f.coordinator.show({ remainingMs: 3000 }, () => rendered++);
  assert.equal(f.timers.size, 1);
  f.coordinator.show({ remainingMs: 2000 }, () => rendered++);
  assert.equal(f.timers.size, 1);
  assert.equal(rendered, 2);
  const timer = [...f.timers.values()][0];
  assert.equal(timer.delay, 2030);
  timer.fn();
  assert.equal(f.refreshes(), 1);
});

test('reset clears both timers and private information', () => {
  const f = fixture();
  const state = { id: 'game', phase: 'dawn', lastMurderedId: 'victim' };
  f.coordinator.startSeerResult({ targetName: 'Alice', isWerewolf: false });
  f.coordinator.victimSuspenseStep(state, 'victim');
  f.coordinator.show({ remainingMs: 2000 }, () => {});
  f.coordinator.hold(4000);
  assert.equal(f.timers.size, 2);
  f.coordinator.reset();
  assert.equal(f.timers.size, 0);
  assert.equal(f.coordinator.seerResult, null);
  assert.equal(f.coordinator.victim, null);
  assert.equal(f.coordinator.farewellUntil, 0);
});
