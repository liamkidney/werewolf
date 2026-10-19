import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../src/supabase-client.js', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../src/game-repository.js', import.meta.url), 'utf8');

test('dev Werewolf targets the shared Supabase project and isolated schema', () => {
  assert.match(client, /psoncybkfsdmjksyrcvv\.supabase\.co/);
  assert.match(client, /db:\s*\{\s*schema:\s*'werewolf'\s*\}/);
  assert.doesNotMatch(client, /guldhewlhxhsxchbattf/);
});

test('all database-change subscriptions watch only the Werewolf schema', () => {
  assert.equal((repository.match(/schema: 'werewolf'/g) || []).length, 5);
  assert.doesNotMatch(repository, /schema: 'public'/);
});
