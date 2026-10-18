import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/game-session.js';
import { GameRepository } from '../src/game-repository.js';
import { GameController } from '../src/game-controller.js';
import { readFileSync } from 'node:fs';

function sessionAt(search = '', pathname = '/werewolf/dev/') {
  const saved = new Map();
  const storage = {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: key => saved.delete(key)
  };
  let navigated;
  const session = new GameSession({
    storage,
    url: new URL('https://example.com' + pathname + search),
    browserHistory: { replaceState: (_x, _y, path) => { navigated = path; } }
  });
  return { session, saved, get navigated() { return navigated; } };
}

test('rejoin link needs no prior browser state, and removes token after recovery', () => {
  const helper = sessionAt('?theme=pride');
  const url = helper.session.recoveryLink('secret-ticket');
  assert.equal(url, 'https://example.com/werewolf/dev/?theme=pride&recover=secret-ticket');
  const newPhone = sessionAt('?theme=pride&recover=secret-ticket');
  assert.equal(newPhone.session.recoveryToken, 'secret-ticket');
  newPhone.session.savePlayer('game', 'player', 2);
  newPhone.session.enter('game');
  assert.equal(newPhone.navigated, '/werewolf/dev/?theme=pride');
  assert.equal(newPhone.session.playerId('game'), 'player');
  assert.equal(newPhone.session.playerGeneration('game'), 2);
});

test('original phone does not acquire a newer device generation', () => {
  const oldPhone = sessionAt();
  oldPhone.session.savePlayer('game', 'same-player');
  const newPhone = sessionAt('?recover=another-ticket');
  newPhone.session.savePlayer('game', 'same-player', 1);
  assert.equal(oldPhone.session.playerGeneration('game'), 0);
  assert.equal(newPhone.session.playerGeneration('game'), 1);
});

test('repository delegates issuing and redeeming only to one-time ticket RPCs', async () => {
  const calls = [];
  const repository = new GameRepository({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: name === 'issue_player_rejoin_ticket' ? 'opaque-token'
        : { game_id: 'game', player_id: 'player', session_generation: 3, name: 'Fiona' }, error: null };
    }
  });
  assert.equal(await repository.issueRejoinTicket('game', 'helper', 'player'), 'opaque-token');
  assert.deepEqual(await repository.redeemRejoinTicket('opaque-token'), {
    game_id: 'game', player_id: 'player', session_generation: 3, name: 'Fiona'
  });
  assert.deepEqual(calls, [
    { name: 'issue_player_rejoin_ticket',
      args: { p_game_id: 'game', p_issuer_id: 'helper', p_target_id: 'player' } },
    { name: 'redeem_player_rejoin_ticket', args: { p_token: 'opaque-token' } }
  ]);
});

test('any game member can request a QR for the original player record', async () => {
  const calls = [];
  const game = Object.create(GameController.prototype);
  game.state = { id: 'game', status: 'playing', players: [
    { id: 'host', name: 'Host' }, { id: 'helper', name: 'Helper' }
  ] };
  game.playerId = 'helper';
  game.staleSession = false;
  game.recoverySaving = false;
  game.session = { recoveryLink: token => '/?recover=' + token };
  game.repository = {
    issueRejoinTicket: async (...args) => { calls.push(args); return 'token'; }
  };
  game.screens = {
    setRecoveryBusy: value => calls.push(['busy', value]),
    showRecoveryError: message => calls.push(['error', message]),
    renderRecoveryQr: async (url, name) => calls.push(['qr', url, name])
  };
  await game.issueRecovery('host');
  assert.deepEqual(calls, [
    ['busy', true], ['error', ''],
    ['game', 'helper', 'host'],
    ['qr', '/?recover=token', 'Host'],
    ['busy', false]
  ]);
});

test('already transferred player cannot generate a new QR or use gameplay commands', async () => {
  const game = Object.create(GameController.prototype);
  game.state = { id: 'game', status: 'playing', players: [{ id: 'player' }] };
  game.staleSession = true;
  game.playerId = 'player';
  game.recoverySaving = false;
  game.stateEngine = { can: () => true };
  assert.equal(game.can('START_DAY'), false);
  await game.issueRecovery('player');
});

test('recovery UI includes accessible player selector, QR canvas and transferred screen', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['help-rejoin', 'recovery-dialog', 'recovery-player',
    'recovery-generate', 'recovery-qr', 'session-transferred']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});
