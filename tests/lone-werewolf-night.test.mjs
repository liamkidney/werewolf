import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Screens } from '../src/screens.js';
import { workflowStatus } from '../src/workflow-status.js';

function nightFixture(wolves, votes = []) {
  const elements = new Map();
  const element = tag => ({
    tag, children: [], hidden: false, textContent: '', style: {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; }
  });
  const oldDocument = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    createElement: element
  };
  try {
    const screens = Object.create(Screens.prototype);
    screens.showScreen = () => {};
    const state = {
      phase: 'night', status: 'playing', roundNumber: 2,
      players: [
        { id: 'wolf1', name: 'Wolfram', eliminated_at: null },
        { id: 'wolf2', name: 'Wolfgang', eliminated_at: wolves.length < 2 ? 'earlier' : null },
        { id: 'a', name: 'Alice', eliminated_at: null },
        { id: 'b', name: 'Beatrice', eliminated_at: null }
      ]
    };
    const pack = { wolves, votes };
    screens.renderNight(state, {
      playerId: 'wolf1', role: 'werewolf', pack, casting: false
    });
    return { elements, state, pack };
  } finally {
    globalThis.document = oldDocument;
  }
}

test('a lone wolf sees only direct victim choices', () => {
  const { elements, state, pack } = nightFixture([{ id: 'wolf1', name: 'Wolfram' }]);
  const get = id => elements.get(id);
  assert.equal(get('night-instruction').textContent,
    'You are the only werewolf! Pick a villager to eliminate.');
  assert.equal(get('night-wolf-roster').hidden, true);
  assert.equal(get('night-wolf-choose-heading').hidden, true);
  assert.equal(get('night-wolves').children.length, 0);
  assert.equal(get('night-progress').textContent, '');
  const choices = get('night-targets').children;
  assert.equal(choices.length, 2);
  assert.deepEqual(choices.map(choice => choice.children.map(node => node.tag)), [
    ['input', 'span'], ['input', 'span']
  ]);
  assert.deepEqual(choices.map(choice => choice.children[1].textContent),
    ['Alice', 'Beatrice']);
  const status = workflowStatus(state, { role: 'werewolf', playerId: 'wolf1', pack });
  assert.equal(status.title, 'Choose your victim');
  assert.doesNotMatch(status.message, /consensus|unanimous|pack/i);
});

test('a lone wolf sees a simple confirmation after selecting', () => {
  const { elements, state, pack } = nightFixture(
    [{ id: 'wolf1', name: 'Wolfram' }],
    [{ voter_id: 'wolf1', target_id: 'a' }]
  );
  assert.match(elements.get('night-progress').textContent,
    /Choice recorded. Waiting for the remaining night actions/);
  const choices = elements.get('night-targets').children;
  assert.equal(choices[0].children[0].checked, true);
  assert.equal(choices[1].children[0].checked, false);
  const status = workflowStatus(state, { role: 'werewolf', playerId: 'wolf1', pack });
  assert.equal(status.title, 'Your victim is selected');
});

test('two living werewolves retain pack roster, percentages and consensus', () => {
  const { elements, state, pack } = nightFixture([
    { id: 'wolf1', name: 'Wolfram' },
    { id: 'wolf2', name: 'Wolfgang' }
  ], [{ voter_id: 'wolf1', target_id: 'a' }]);
  const get = id => elements.get(id);
  assert.equal(get('night-instruction').textContent, 'Agree on one villager to eliminate.');
  assert.equal(get('night-wolf-roster').hidden, false);
  assert.equal(get('night-wolf-choose-heading').hidden, false);
  assert.equal(get('night-wolves').children.length, 2);
  assert.equal(get('night-targets').children[0].children.length, 4);
  assert.equal(get('night-targets').children[0].children[3].textContent, '50%');
  assert.match(get('night-progress').textContent, /Unanimous agreement/);
  const status = workflowStatus(state, { role: 'werewolf', playerId: 'wolf1', pack });
  assert.match(status.message, /All werewolves must agree/);
});
