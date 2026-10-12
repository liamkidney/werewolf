import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const db = createClient('https://guldhewlhxhsxchbattf.supabase.co', 'sb_publishable_6g3XdNkAJesxzGzFZ9ulYg_redoxZWj');
const $ = (id) => document.getElementById(id);
const form = $('new-game'), input = $('player-name'), error = $('name-error');
const lobby = $('lobby'), hero = document.querySelector('.hero'), list = $('player-list');
const params = new URLSearchParams(location.search);
const requestedGame = params.get('game');
const storageKey = 'werewolf:identity:' + (requestedGame || 'host');
let currentGame = null, channel = null, isHost = false;
function showError(message) { $('app-error').textContent = message; $('app-error').hidden = !message; }
function showLobby() { hero.hidden = true; form.hidden = true; lobby.hidden = false; }
function setBusy(busy) { form.querySelector('button').disabled = busy; }
function identityKey(gameId) { return 'werewolf:player:' + gameId; }
async function loadPlayers() {
  if (!currentGame) return;
  const { data, error } = await db.from('players').select('id,name').eq('game_id',currentGame).order('joined_at');
  if (error) { showError(error.message); return; }
  list.replaceChildren();
  for (const player of data) {
    const li = document.createElement('li');
    li.textContent = player.name;
    list.append(li);
  }
  $('lobby-message').textContent = data.length + (data.length === 1 ? ' player joined' : ' players joined');
}
async function enterLobby(gameId, host) {
  currentGame = gameId; isHost = host;
  showLobby();
  $('lobby-title').textContent = host ? 'Your game lobby' : 'Game lobby';
  $('lobby-code').textContent = 'Game ' + gameId.slice(0,8).toUpperCase();
  $('host-tools').hidden = !host;
  $('invite-link').value = new URL('?game=' + encodeURIComponent(gameId), location.href).href;
  await loadPlayers();
  if (channel) await db.removeChannel(channel);
  channel = db.channel('lobby-' + gameId)
    .on('postgres_changes', {event:'*',schema:'public',table:'players',filter:'game_id=eq.'+gameId}, loadPlayers)
    .subscribe();
}
async function join(gameId, name, host) {
  const existing = localStorage.getItem(identityKey(gameId));
  const playerId = existing || crypto.randomUUID();
  const { error } = await db.from('players').upsert({id:playerId,game_id:gameId,name}, {onConflict:'id'});
  if (error) throw error;
  localStorage.setItem(identityKey(gameId), playerId);
  localStorage.setItem('werewolf:last-game', gameId);
  localStorage.setItem('werewolf:name', name);
  if (host) localStorage.setItem('werewolf:host:'+gameId,'true');
  await enterLobby(gameId,host);
}
async function start(name) {
  if (requestedGame) {
    const {data,error} = await db.from('games').select('id,status').eq('id',requestedGame).maybeSingle();
    if (error) throw error;
    if (!data || data.status !== 'lobby') throw new Error('This game is unavailable.');
    await join(requestedGame,name,false);
  } else {
    const {data,error} = await db.from('games').insert({}).select('id').single();
    if (error) throw error;
    await join(data.id,name,true);
    history.replaceState(null,'',location.pathname+'?game='+data.id);
  }
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const name=input.value.trim();
  if (!name) {error.hidden=false;input.focus();return;}
  error.hidden=true;showError('');setBusy(true);
  try { await start(name); } catch(e) {showError(e.message || 'Could not connect to Supabase.');}
  finally {setBusy(false);}
});
input.addEventListener('input',()=>{error.hidden=true;});
$('copy-link').addEventListener('click',async()=>{
  try {await navigator.clipboard.writeText($('invite-link').value);$('copy-link').textContent='Copied!';}
  catch { $('invite-link').select(); }
});
$('leave-lobby').addEventListener('click',()=>{location.href=location.pathname;});
(async()=>{
  input.value=localStorage.getItem('werewolf:name')||'';
  if (requestedGame) {
    const playerId=localStorage.getItem(identityKey(requestedGame));
    if (playerId) {
      const {data}=await db.from('players').select('id').eq('id',playerId).eq('game_id',requestedGame).maybeSingle();
      if(data) {await enterLobby(requestedGame,localStorage.getItem('werewolf:host:'+requestedGame)==='true');return;}
    }
    document.querySelector('.entry label').textContent='Enter your name to join';
    form.querySelector('button').textContent='Join Game →';
  }
})();
