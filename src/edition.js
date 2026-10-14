// Presentation-only editions. The game rules and Supabase protocol are shared.
export const EDITION_CLASSIC = 'classic';
export const EDITION_PRIDE = 'pride';

export function editionFromSearch(search = '') {
  return new URLSearchParams(search).get('theme') === EDITION_PRIDE
    ? EDITION_PRIDE : EDITION_CLASSIC;
}

export const PRIDE_COPY = Object.freeze({
  title: 'QUEERWOLF',
  tagline: 'Secrets, suspicion & fabulous betrayal.',
  hostInvitation: 'Bring your crew',
  guestWelcome: "You're on the list.",
  guestWaiting: 'Waiting for the host to kick things off.',
  roleDescriptions: Object.freeze({
    villager: 'You are a villager. Spot the werewolves before the party ends.',
    seer: 'You are the Seer. Investigate one player every night. Keep the mystery alive.',
    werewolf: 'You are a werewolf. Your secret is the night’s biggest scandal.'
  }),
  dayDiscussion: 'The floor is yours',
  dayVote: 'Who gets banished?',
  dayInstruction: 'Make your case. Voting begins when the countdown ends.',
  votingInstruction: 'Choose one player to banish. Your vote is final.',
  nightHeading: 'After dark',
  wolfVictory: 'The Pack Takes the Crown',
  villageVictory: 'The Village Takes the Crown'
});

/** Apply the edition before the game controller is constructed.
 * All changes are cosmetic: no role IDs or database fields are renamed.
 */
export function applyEdition(doc, edition) {
  const pride = edition === EDITION_PRIDE;
  doc.body.dataset.edition = pride ? EDITION_PRIDE : EDITION_CLASSIC;
  const switcher = doc.getElementById('edition-switch');
  if (switcher) {
    switcher.href = pride ? './' : './?theme=pride';
    switcher.textContent = pride ? '← Classic Werewolf' : '✦ Try Queerwolf — Pride edition';
  }
  if (!pride) return;

  doc.title = 'Queerwolf — Pride After Dark';
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#130A26');
  doc.querySelector('.hero')?.setAttribute('aria-label', 'Queerwolf, Pride edition');

  const text = (selector, value) => {
    const element = doc.querySelector(selector);
    if (element) element.textContent = value;
  };
  text('.hero h1', PRIDE_COPY.title);
  text('.hero .tagline', PRIDE_COPY.tagline);
  text('#edition-kicker', 'PRIDE AFTER DARK');
  const kicker = doc.getElementById('edition-kicker');
  if (kicker) kicker.hidden = false;
  text('#new-game label', 'What should we call you?');
  const button = doc.querySelector('#new-game button[type="submit"]');
  if (button?.firstChild) button.firstChild.textContent = 'Enter the party ';
  text('#entry-context', 'YOU’RE INVITED');
  text('#host-tools .join-heading', PRIDE_COPY.hostInvitation);
  text('#guest-intro h2', PRIDE_COPY.guestWelcome);
  text('#guest-intro p', PRIDE_COPY.guestWaiting);
  text('#role-screen > .muted', 'Your secret identity');
  text('.role-reminder', 'Keep your identity under wraps. The drama is only beginning.');
  text('#suspense-screen h2', 'The wolves have made their move');
  text('#seer-result-screen > .lobby-eyebrow', 'THE SEER KNOWS');
  text('#dawn-screen > .lobby-eyebrow', 'THE MORNING AFTER');
  text('#endgame-screen > .lobby-eyebrow', 'THE FINAL ACT');
  text('#night-wolf-choose-heading', 'Choose your target');
  text('#day-screen .vote-label', 'Who is leaving the party?');
  const resume = doc.getElementById('resume-game');
  if (resume) resume.href = './?theme=pride&resume=1';
  const footer = doc.getElementById('game-footer');
  if (footer) footer.href = './?theme=pride';
}
