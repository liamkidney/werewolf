import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyEdition, editionFromSearch, PRIDE_COPY } from '../src/edition.js';

function documentFixture() {
  const nodes = new Map();
  const create = name => ({
    name, textContent: '', href: '', hidden: true, firstChild: { textContent: '' },
    attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; }
  });
  const node = name => {
    if (!nodes.has(name)) nodes.set(name, create(name));
    return nodes.get(name);
  };
  return {
    document: {
      body: { dataset: {} }, title: 'Werewolf',
      querySelector: node,
      getElementById: id => node('#' + id)
    },
    node
  };
}

test('only an explicit Pride query parameter changes editions', () => {
  assert.equal(editionFromSearch(''), 'classic');
  assert.equal(editionFromSearch('?theme=pride'), 'pride');
  assert.equal(editionFromSearch('?game=abc&theme=pride'), 'pride');
  assert.equal(editionFromSearch('?theme=classic'), 'classic');
  assert.equal(editionFromSearch('?theme=unknown'), 'classic');
});

test('classic edition remains untouched apart from an optional edition link', () => {
  const { document, node } = documentFixture();
  node('.hero h1').textContent = 'WEREWOLF';
  applyEdition(document, 'classic');
  assert.equal(document.body.dataset.edition, 'classic');
  assert.equal(document.title, 'Werewolf');
  assert.equal(node('.hero h1').textContent, 'WEREWOLF');
  assert.equal(node('#edition-switch').href, './?theme=pride');
  assert.match(node('#edition-switch').textContent, /Queerwolf/);
  assert.equal(node('#edition-kicker').hidden, true);
});

test('Pride edition changes the entire presentation, not gameplay roles', () => {
  const { document, node } = documentFixture();
  applyEdition(document, 'pride');
  assert.equal(document.body.dataset.edition, 'pride');
  assert.equal(document.title, 'Queerwolf — Pride After Dark');
  assert.equal(node('.hero h1').textContent, 'QUEERWOLF');
  assert.equal(node('.hero .tagline').textContent, PRIDE_COPY.tagline);
  assert.equal(node('#edition-kicker').hidden, false);
  assert.equal(node('#edition-kicker').textContent, 'PRIDE AFTER DARK');
  assert.equal(node('#host-tools .join-heading').textContent, PRIDE_COPY.hostInvitation);
  assert.equal(node('#guest-intro h2').textContent, PRIDE_COPY.guestWelcome);
  assert.equal(node('#new-game button[type="submit"]').firstChild.textContent, 'Enter the party ');
  assert.equal(node('#edition-switch').href, './');
  assert.equal(node('#resume-game').href, './?theme=pride&resume=1');
  assert.equal(node('#game-footer').href, './?theme=pride');
  assert.equal(node('meta[name="theme-color"]').attributes.content, '#130A26');
  assert.equal(PRIDE_COPY.roleDescriptions.werewolf.includes('werewolf'), true);
});

test('Pride CSS is opt-in and the normal gameplay stylesheet remains loaded', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../pride.css', import.meta.url), 'utf8');
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /href="\.\/pride\.css"/);
  assert.match(html, /id="edition-switch"/);
  assert.match(css, /body\[data-edition="pride"\]/);
  assert.match(css, /#f2edfa/);
  assert.match(css, /#130a26/);
  assert.match(css, /\.presentation-progress-fill/);
  assert.match(css, /#role-screen/);
  assert.match(css, /prefers-reduced-motion/);
});
