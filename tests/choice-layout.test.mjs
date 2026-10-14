import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('all night roles use one full-width choice panel layout', () => {
  for (const id of [
    'night-villager-controls',
    'night-seer-controls',
    'night-wolf-controls'
  ]) {
    assert.match(html, new RegExp(
      '<div id="' + id + '" class="night-action-controls" hidden>'
    ));
  }
  assert.match(css, /\.night-action-controls\s*\{[^}]*width:100%;min-width:0/);
});

test('night and day vote options retain a stable grid width when choices change', () => {
  assert.match(css, /\.night-targets\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.night-choice\s*\{[^}]*width:100%;min-width:0/);
  assert.match(css, /\.night-choice input\s*\{[^}]*padding:0;border:0/);
});
