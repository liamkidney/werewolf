import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../src/game-controller.js', import.meta.url), 'utf8');

test('home and invitation screens keep the form adjacent to the branding', () => {
  assert.match(css, /\.screen:has\(> \.entry:not\(\[hidden\]\)\)\{\s*display:flex;flex-direction:column;gap:0/);
  assert.doesNotMatch(css, /grid-template-rows:auto minmax\(0,1fr\) auto auto/);
  assert.match(css, /\.screen:has\(> \.entry:not\(\[hidden\]\)\) > \.entry\{[^}]*margin:32px auto 0/);
  assert.match(css, /\.screen:has\(> \.entry:not\(\[hidden\]\)\) > \.site-footer\{[^}]*margin-top:auto/);
});

test('entry pages use a smaller title, concise introduction and accessible form', () => {
  assert.match(css, /\.screen:has\(> \.entry:not\(\[hidden\]\)\) > \.hero h1\{[^}]*font-size:clamp\(2\.8rem,11\.5vw,4rem\)/);
  assert.match(html, /A game of deception and deduction/);
  assert.doesNotMatch(html, /A party game of deception<br>/);
  assert.match(html, /<label for="player-name">What's your name\?<\/label>/);
  assert.match(css, /min-height:56px;border-radius:10px/);
});

test('invitation entry retains the arrow and marks the join intent explicitly', () => {
  assert.match(html, /id="entry-context" class="entry-context" hidden>JOIN THE VILLAGE/);
  assert.match(controller, /getElementById\('entry-context'\)\.hidden = false/);
  assert.match(controller, /this\.session\.edition === 'pride' \? 'Join the party ' : 'Join Game '/);
  assert.match(html, /<button type="submit">Let's Play <span aria-hidden="true">→<\/span><\/button>/);
});

test('both lobby types use shared compact spacing and retain their actions', () => {
  assert.match(css, /body\.light-screen \.lobby\{[^}]*gap:12px/);
  assert.match(css, /body\.light-screen \.lobby #host-tools\{[^}]*gap:10px/);
  assert.match(css, /body\.light-screen \.qr-wrap canvas\{[^}]*min\(42vw,160px\)/);
  assert.match(html, /Invite your village/);
  assert.match(html, /Waiting for the host to begin\./);
  for (const id of ['join-qr','copy-link','player-list','wolf-minus','seer-minus','start-game']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});
