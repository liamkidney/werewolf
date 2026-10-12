import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameSync } from '../src/game-sync.js';

test('subscription refreshes on connect and change', async () => {
  let changeHandler;
  let statusHandler;
  let stopped = false;
  const channel = { subscribe(handler) { statusHandler = handler; } };
  const repository = {
    subscribeToGame(id, handler) {
      assert.equal(id, 'game');
      changeHandler = handler;
      return channel;
    },
    async disposeChannel(value) {
      assert.equal(value, channel);
      stopped = true;
    }
  };
  const sync = new GameSync(repository);
  let changes = 0;
  await sync.subscribe('game', () => changes++);
  statusHandler('SUBSCRIBED');
  changeHandler();
  assert.equal(changes, 2);
  await sync.stop();
  assert.equal(stopped, true);
});

test('resubscribing removes previous channel', async () => {
  const removed = [];
  const repository = {
    subscribeToGame(id) { return { id, subscribe() {} }; },
    async disposeChannel(channel) { removed.push(channel.id); }
  };
  const sync = new GameSync(repository);
  await sync.subscribe('old', () => {});
  await sync.subscribe('new', () => {});
  assert.deepEqual(removed, ['old']);
});
