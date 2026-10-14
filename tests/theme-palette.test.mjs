import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function token(name) {
  const match = css.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})\\s*;'));
  assert.ok(match, 'Missing shared colour token: ' + name);
  return match[1].toLowerCase();
}

function luminance(hex) {
  const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map(value =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

test('home and join pages share the navy, ivory and crimson palette', () => {
  assert.equal(token('entry-bg'), '#0b1926');
  assert.equal(token('entry-ink'), '#f8f4ee');
  assert.equal(token('entry-secondary'), '#c6ccd2');
  assert.equal(token('entry-accent'), '#d92d3a');
  assert.match(css, /body\{[^}]*background:var\(--entry-bg\)/);
  assert.match(css, /\.art\{--art-base:var\(--entry-bg\)\}/);
  assert.match(css, /\.tagline\{[^}]*color:var\(--entry-secondary\)/);
  assert.match(css, /\.entry button:hover\{background:var\(--entry-accent-hover\)\}/);
  assert.match(html, /<meta name="theme-color" content="#0B1926">/);
});

test('both host and guest lobbies inherit one warm-bone palette', () => {
  assert.equal(token('lobby-bg'), '#e8e5dd');
  assert.equal(token('lobby-panel'), '#f6f4ee');
  assert.equal(token('lobby-ink'), '#19232e');
  assert.equal(token('lobby-accent'), '#8d303b');
  assert.match(css, /--phase-bg:var\(--lobby-bg\);--phase-panel:var\(--lobby-panel\);--phase-ink:var\(--lobby-ink\)/);
  assert.match(css, /body\.light-screen \.invite-row button\{[^}]*background:var\(--lobby-panel\)/);
  assert.match(css, /body\.light-screen \.guest-intro p\{[^}]*color:var\(--lobby-muted\)/);
});

test('entry and lobby text and button combinations meet normal text contrast', () => {
  for (const [foreground, background] of [
    ['entry-ink', 'entry-bg'],
    ['entry-secondary', 'entry-bg'],
    ['entry-muted', 'entry-bg'],
    ['lobby-ink', 'lobby-bg'],
    ['lobby-muted', 'lobby-bg'],
    ['lobby-ink', 'lobby-panel'],
    ['lobby-accent', 'lobby-panel']
  ]) {
    assert.ok(contrast(token(foreground), token(background)) >= 4.5,
      foreground + ' on ' + background + ' is below 4.5:1');
  }
  assert.ok(contrast('#ffffff', token('entry-accent')) >= 4.5,
    'White primary-button text should remain readable');
});
