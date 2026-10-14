import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('every primary button takes its background from one burgundy token', () => {
  assert.match(css, /--action-primary:#8d303b;/);
  assert.match(css, /--entry-accent:var\(--action-primary\)/);
  assert.match(css, /--lobby-accent:var\(--action-primary\)/);
  assert.match(css, /#phase-host-controls button\{[^}]*background:var\(--action-primary\)/);
  assert.match(css, /body\.light-screen \.day-screen button:not\(\.night-choice\),[\s\S]*?body\.light-screen #start-game\{[^}]*background:var\(--action-primary\)/);
  assert.match(css, /\.marquee-screen #finish-voting\{[^}]*background:var\(--action-primary\)/);
  assert.doesNotMatch(css, /background:\s*#(?:d92d3a|b82d39|ed3a47|bf2532)\b/i);
});

test('disabled actions are distinct from active ones without alternative red shades', () => {
  assert.match(css, /button:disabled\{opacity:\.42;cursor:not-allowed\}/);
  assert.doesNotMatch(css, /(?:button:disabled|button\[disabled\])\{[^}]*background:/);
  assert.match(css, /@media\(hover:hover\)\{button:not\(:disabled\):hover\{filter:brightness\(\.94\)\}\}/);
  assert.doesNotMatch(css, /\.entry button:hover\{/);
});

test('dark-background primary buttons keep a visible edge', () => {
  assert.match(css, /--action-border-on-dark:#b9777d;/);
  assert.match(css, /\.entry button\{[^}]*border:1px solid var\(--action-border-on-dark\)/);
  assert.match(css, /#role-screen #phase-host-controls button\{[^}]*border:1px solid var\(--action-border-on-dark\)/);
});

test('copy-link and stepper controls remain visually secondary', () => {
  assert.match(css, /body\.light-screen \.invite-row button\{[^}]*background:var\(--lobby-panel\)/);
  assert.match(css, /body\.light-screen \.stepper button\{[^}]*background:transparent/);
});
