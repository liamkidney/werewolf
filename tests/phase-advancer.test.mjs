import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PhaseAdvancer } from '../src/phase-advancer.js';

function fixture(phase = 'results') {
  const events = [];
  const timers = new Map();
  let currentTime = 10000;
  let nextTimerId = 0;
  let state = { id: 'game-1', roundNumber: 3, status: 'playing', phase };
  const allowed = { AUTO_START_NIGHT: true, AUTO_START_DAY: true };
  const repo = {
    async autoStartDay(id, round) { events.push(['day', id, round]); return true; },
    async autoStartNight(id, round) { events.push(['night', id, round]); return true; }
  };
  const advancer = new PhaseAdvancer({
    repository: repo,
    getState: () => state,
    can: command => allowed[command],
    requestRefresh: () => events.push(['refresh']),
    reportError: message => events.push(['error', message]),
    now: () => currentTime,
    schedule: (fn, delay) => {
      const id = ++nextTimerId;
      timers.set(id, { fn: () => { timers.delete(id); fn(); }, delay });
      return id;
    },
    cancel: id => timers.delete(id)
  });
  return {
    advancer, repo, events, timers, allowed,
    setState: next => { state = { ...state, ...next }; },
    addTime: ms => { currentTime += ms; }
  };
}

test('banishment advances once and repeated requests are throttled', async () => {
  const f = fixture();
  assert.equal(await f.advancer.advance(), true);
  assert.deepEqual(f.events, [['night', 'game-1', 3], ['refresh']]);
  assert.equal(await f.advancer.advance(), false);
  assert.equal(f.events.length, 2);
});

test('dawn uses the same coordinator and the distinct day RPC', async () => {
  const f = fixture('dawn');
  assert.equal(await f.advancer.advance(), true);
  assert.deepEqual(f.events, [['day', 'game-1', 3], ['refresh']]);
});

test('finished, invalid and disallowed states do not issue RPCs', async () => {
  const f = fixture();
  f.setState({ status: 'finished' });
  f.allowed.AUTO_START_NIGHT = false;
  assert.equal(await f.advancer.advance(), false);
  f.allowed.AUTO_START_NIGHT = true;
  f.setState({ phase: 'night' });
  assert.equal(await f.advancer.advance(), false);
  assert.deepEqual(f.events, []);
});

test('a stale response queues a retry, which stops on phase changes', async () => {
  const f = fixture();
  f.repo.autoStartNight = async () => { f.events.push(['night']); return false; };
  assert.equal(await f.advancer.advance(), false);
  assert.equal(f.timers.size, 1);
  const timer = [...f.timers.values()][0];
  assert.equal(timer.delay, 1500);
  f.setState({ phase: 'night' });
  timer.fn();
  assert.deepEqual(f.events, [['night']]);
  f.advancer.stopRetry();
  assert.equal(f.timers.size, 0);
});

test('reset clears pending retries and throttling for another game', async () => {
  const f = fixture();
  f.repo.autoStartNight = async () => false;
  await f.advancer.advance();
  assert.equal(f.timers.size, 1);
  f.advancer.reset();
  assert.equal(f.timers.size, 0);
  f.setState({ id: 'game-2' });
  f.repo.autoStartNight = async () => true;
  assert.equal(await f.advancer.advance(), true);
});

test('a failed request reports its error and retries without leaking to a new game', async () => {
  const f = fixture();
  f.repo.autoStartNight = async () => { throw new Error('Offline'); };
  assert.equal(await f.advancer.advance(), false);
  assert.deepEqual(f.events, [['error', 'Offline']]);
  assert.equal(f.timers.size, 1);
  f.advancer.reset();
  f.setState({ id: 'game-2' });
  assert.equal(f.timers.size, 0);
});
