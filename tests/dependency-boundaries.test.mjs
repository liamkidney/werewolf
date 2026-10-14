import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameController } from '../src/game-controller.js';
import { GameRepository } from '../src/game-repository.js';

test('controller and repository modules load in Node without a browser-only URL import', () => {
  assert.equal(typeof GameController, 'function');
  assert.equal(typeof GameRepository, 'function');
});

test('GameRepository uses the injected Supabase client', () => {
  const client = { from: () => null, rpc: () => null };
  const repository = new GameRepository(client);
  assert.equal(repository.db, client);
  assert.throws(() => new GameRepository(), /Supabase client must be provided/);
});

test('GameController requires an explicit repository', () => {
  assert.throws(() => new GameController({ repository: null, screens: {} }),
    /game repository must be provided/);
});
