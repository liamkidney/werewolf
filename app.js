const form = document.querySelector('#new-game');
const input = document.querySelector('#player-name');
const error = document.querySelector('#name-error');
const nextStep = document.querySelector('#next-step');
const hostName = document.querySelector('#host-name');
const backButton = document.querySelector('#back-button');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) {
    error.hidden = false;
    input.focus();
    return;
  }
  error.hidden = true;
  hostName.textContent = name;
  form.hidden = true;
  nextStep.hidden = false;
});

input.addEventListener('input', () => { error.hidden = true; });
backButton.addEventListener('click', () => {
  nextStep.hidden = true;
  form.hidden = false;
  input.focus();
});