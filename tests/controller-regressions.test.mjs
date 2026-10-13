import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameController } from '../src/game-controller.js';
import { StateEngine } from '../src/state-engine.js';

function controller(state) {
  const calls = [];
  const c = Object.create(GameController.prototype);
  c.state = state;
  c.stateEngine = new StateEngine();
  c.playerId = 'living';
  c.playerRole = 'villager';
  c.eliminated = false;
  c.isHost = false;
  c.casting = false;
  c.finishing = false;
  c.endingDiscussion = false;
  c.openingVoting = false;
  c.dayVotingOpen = false;
  c.dayVoteSignature = '';
  c.nightPoll = null;
  c.dayTicker = null;
  c.stopDayTimer = () => {};
  c.stopNightPoll = () => {};
  c.presentations = { stopStep: () => calls.push('stopStep'), stopHold: () => {},
    hold: delay => calls.push(['hold', delay]) };
  c.phaseAdvancer = { stopRetry: () => {}, advance: () => { calls.push('autoAdvance'); return Promise.resolve(true); } };
  c.screens = {
    renderRoleStartControls: () => calls.push('roleControls'),
    showRole: () => calls.push('role'),
    renderNight: () => calls.push('night'),
    renderBanishment: () => calls.push('banishment'),
    renderMurderReveal: () => calls.push('murder'),
    renderWorkflow: () => {},
    renderDay: () => calls.push('day'),
    updateClock: () => calls.push('clock'),
    renderMarquee: () => calls.push('marquee')
  };
  return { c, calls };
}

test('day ticker uses the state engine without a stale view variable', () => {
  const now = Date.now();
  const { c, calls } = controller({
    id: 'game', status: 'playing', phase: 'day', step: 'discussion',
    phaseStartedAt: new Date(now).toISOString(), dayDurationSeconds: 120,
    roundNumber: 2, players: [{ id: 'living', eliminated_at: null }], votes: []
  });
  const oldDocument = globalThis.document;
  globalThis.document = {
    getElementById: id => ({ hidden: true, textContent: '' })
  };
  try {
    c.renderDay();
    assert.ok(calls.includes('day'));
    assert.ok(calls.includes('clock'));
  } finally {
    globalThis.document = oldDocument;
  }
});

test('completed banishment delegates night start to PhaseAdvancer', () => {
  const { c, calls } = controller({
    id: 'game', status: 'playing', phase: 'results', roundNumber: 2,
    phaseStartedAt: new Date(Date.now() - 9000).toISOString(),
    lastBanishedId: 'banished',
    players: [{ id: 'living', eliminated_at: null },
      { id: 'banished', eliminated_at: 'now' }], votes: []
  });
  c.renderCurrentScreen();
  assert.ok(calls.includes('banishment'));
  assert.ok(calls.includes('autoAdvance'));
});

test('finished presentation delegates the credits to one method', () => {
  const { c, calls } = controller({
    id: 'game', status: 'finished', phase: 'results', roundNumber: 2,
    phaseStartedAt: new Date(Date.now() - 10000).toISOString(),
    players: [{ id: 'living', eliminated_at: null }], votes: []
  });
  c.showFinalCredits = () => calls.push('credits');
  c.renderFinished(c.state);
  assert.ok(calls.includes('credits'));
  assert.ok(calls.includes('stopStep'));
});

test('role-reveal screen has explicit host controls and no phase metadata', () => {
  const { c, calls } = controller({
    id: 'game', status: 'playing', phase: 'reveal', roundNumber: 1,
    players: [{ id: 'living', eliminated_at: null }], votes: []
  });
  c.renderCurrentScreen();
  assert.ok(calls.includes('role'));
  assert.ok(calls.includes('roleControls'));
});

test('an already eliminated player never enters a gameplay render path', () => {
  const { c, calls } = controller({
    id: 'game', status: 'playing', phase: 'night', roundNumber: 2,
    players: [{ id: 'living', eliminated_at: 'now' }], votes: []
  });
  c.eliminated = true;
  c.renderCurrentScreen();
  assert.deepEqual(calls, []);
});
