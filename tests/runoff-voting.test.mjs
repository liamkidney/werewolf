import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { GameState } from '../src/game-state.js';
import { GameController } from '../src/game-controller.js';
import { Screens } from '../src/screens.js';
import { workflowStatus } from '../src/workflow-status.js';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('runoff ballots, stage and candidates are immutable and default to legacy compatibility', () => {
  const old = new GameState();
  assert.equal(old.runoffEnabled, false);
  assert.equal(old.voteStage, 'initial');
  assert.deepEqual(old.runoffCandidates, []);
  const newState = old.with({
    runoffEnabled: true, voteStage: 'runoff', runoffCandidates: ['a', 'b'],
    runoffVotes: [{ voter_id: 'c', target_id: 'a', round_number: 1 }]
  });
  assert.ok(Object.isFrozen(newState.runoffCandidates));
  assert.ok(Object.isFrozen(newState.runoffVotes));
  assert.ok(Object.isFrozen(newState.runoffVotes[0]));
  assert.equal(old.voteStage, 'initial');
  assert.deepEqual(newState.runoffCandidates, ['a', 'b']);
});

test('all living players are guided to a separate runoff ballot', () => {
  const state = new GameState({
    status: 'playing', phase: 'day', step: 'voting', roundNumber: 2,
    runoffEnabled: true, voteStage: 'runoff',
    runoffCandidates: ['a', 'b'],
    players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    votes: [{ voter_id: 'a', target_id: 'b', round_number: 2 }],
    runoffVotes: [{ voter_id: 'c', target_id: 'a', round_number: 2 }]
  });
  const info = workflowStatus(state, { playerId: 'c' });
  assert.match(info.label, /RUNOFF/);
  assert.match(info.title, /locked/);
  assert.equal(info.progress, '1 of 3 runoff votes cast');
});

test('runoff candidates are restricted and self-voting is unavailable on the screen', () => {
  const oldDocument = globalThis.document;
  const nodes = new Map();
  const byId = id => {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: false, textContent: '', disabled: false,
      replaceChildren() { this.children = []; },
      querySelector() { return null; },
      append(element) { (this.children ??= []).push(element); }
    });
    return nodes.get(id);
  };
  globalThis.document = {
    getElementById: byId,
    createElement: tag => ({
      tagName: tag, children: [],
      append(...elements) { this.children.push(...elements); }
    })
  };
  try {
    const screens = Object.create(Screens.prototype);
    screens.edition = 'classic';
    screens.showScreen = () => {};
    screens.renderDay(new GameState({
      roundNumber: 3, runoffEnabled: true, voteStage: 'runoff',
      runoffCandidates: ['a', 'b', 'c'],
      players: [
        { id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' },
        { id: 'c', name: 'Chris' }, { id: 'd', name: 'David' }
      ], runoffVotes: [], votes: []
    }), { playerId: 'a', voting: true, myVote: null, isHost: false });
    assert.equal(byId('day-heading').textContent, 'Runoff vote');
    assert.match(byId('day-instruction').textContent, /leading candidates/);
    const options = byId('vote-targets').children;
    assert.deepEqual(options.map(label => label.children[1].textContent), ['Bob', 'Chris']);
    assert.deepEqual(options.map(label => label.children[0].value), ['b', 'c']);
  } finally {
    globalThis.document = oldDocument;
  }
});

test('runoff votes use the new atomic RPC; ordinary votes retain their existing path', async () => {
  const calls = [];
  const c = Object.create(GameController.prototype);
  c.playerId = 'c';
  c.casting = false;
  c.can = () => true;
  c.showActionError = () => {};
  c.requestRefresh = () => calls.push('refresh');
  c.repository = {
    castVote: async (...args) => calls.push(['initial', ...args]),
    castRunoffVote: async (...args) => calls.push(['runoff', ...args])
  };
  c.state = new GameState({ id: 'game', roundNumber: 5, runoffEnabled: true, voteStage: 'runoff' });
  await c.castVote('a');
  assert.deepEqual(calls[0], ['runoff', 'game', 5, 'c', 'a']);
  c.state = c.state.with({ voteStage: 'initial' });
  await c.castVote('b');
  assert.deepEqual(calls[2], ['initial', 'game', 5, 'c', 'b']);
});

test('a second tie receives the six-second result presentation without eliminating anyone', () => {
  const calls = [];
  const c = Object.create(GameController.prototype);
  c.state = new GameState({ id: 'game', status: 'playing', phase: 'results', lastBanishedId: null });
  c.presentations = { show: (step, callback) => callback(step) };
  c.screens = {
    renderBanishment: () => calls.push('banishment'),
    renderNoBanishment: () => calls.push('no banishment')
  };
  c.renderTimedPresentation({ screen: 'banishment-screen' });
  assert.deepEqual(calls, ['no banishment']);
});

test('the no-banishment screen communicates the decision and still uses progress timing', () => {
  const doc = globalThis.document;
  const el = new Map();
  globalThis.document = { getElementById: id => {
    if (!el.has(id)) el.set(id, { textContent: '', hidden: false });
    return el.get(id);
  }};
  try {
    const screens = Object.create(Screens.prototype);
    screens.renderBanishment = () => {};
    screens.renderNoBanishment();
    assert.equal(el.get('elimination-heading').textContent, 'NO BANISHMENT');
    assert.match(el.get('banishment-description').textContent, /Nobody is banished/);
  } finally { globalThis.document = doc; }
});

test('the migration isolates the feature to new dev games and blocks double runoffs', () => {
  const sql = read('supabase/migrations/20261015_runoff_vote.sql');
  const repository = read('src/game-repository.js');
  assert.match(sql, /runoff_enabled boolean not null default false/);
  assert.match(repository, /insert\(\{ seer_count: 1, bodyguard_count: 0, runoff_enabled: true \}\)/);
  assert.match(sql, /cardinality\(v_candidates\)>1/);
  assert.match(sql, /v_vote_stage = 'runoff'/);
  assert.match(sql, /v_winner := case when cardinality\(v_candidates\)=1 then v_candidates\[1\] else null end/);
  assert.match(sql, /p_target = any\(g\.runoff_candidates\)/);
  assert.match(sql, /p_voter=p_target/);
  assert.match(sql, /if n_votes=n_active then/);
  assert.match(read('supabase/migrations/20261015_runoff_realtime.sql'), /alter publication supabase_realtime add table public\.day_runoff_votes/);
});
