import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import QRCode from 'https://esm.sh/qrcode@1.5.4';
const db = createClient('https://guldhewlhxhsxchbattf.supabase.co', 'sb_publishable_6g3XdNkAJesxzGzFZ9ulYg_redoxZWj');
const $ = (id) => document.getElementById(id);
const form = $('new-game'), input = $('player-name'), error = $('name-error');
const lobby = $('lobby'), hero = document.querySelector('.hero'), list = $('player-list');
const params = new URLSearchParams(location.search);
const requestedGame = params.get('game');
let playerCount = 0, werewolfCount = 2;
let currentGame = null, channel = null, isHost = false, gameStatus = 'lobby', starting = false;
function showError(message) { $('app-error').textContent = message; $('app-error').hidden = !message; }
function showLobby() { hero.hidden = true; form.hidden = true; lobby.hidden = false; $('role-screen').hidden = true; }
function showRole() { hero.hidden = true; form.hidden = true; lobby.hidden = true; $('role-screen').hidden = false; }
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
  playerCount = data.length;
  updateCounts();
  $('lobby-message').textContent = data.length + (data.length === 1 ? ' player joined' : ' players joined');
}
async function enterLobby(gameId, host) {
  currentGame = gameId; isHost = host;
  showLobby();
  $('lobby-title').textContent = host ? 'Your game lobby' : 'Game lobby';
  $('lobby-code').textContent = 'Game ' + gameId.slice(0,8).toUpperCase();
  $('host-tools').hidden = !host;
  $('invite-link').value = new URL('?game=' + encodeURIComponent(gameId), location.href).href;
  if (host) {
    try { await QRCode.toCanvas($('join-qr'), $('invite-link').value, {width:220, margin:2, color:{dark:'#111d2c',light:'#ffffff'}}); }
    catch (e) { showError('Could not generate QR code. Use the invite link instead.'); }
  }
  if (channel) await db.removeChannel(channel);
  channel = db.channel('lobby-' + gameId)
    .on('postgres_changes', {event:'*',schema:'public',table:'players',filter:'game_id=eq.'+gameId}, () => { void loadPlayers(); })
    .on('postgres_changes', {event:'UPDATE',schema:'public',table:'games',filter:'id=eq.'+gameId}, payload => {
      // The game status is the authoritative signal for everyone to reveal their role.
      if (payload.new.status === 'playing') {
        gameStatus = 'playing';
        updateCounts();
        void loadMyRole();
      } else {
        void loadGameConfig();
      }
    })
    .on('postgres_changes', {event:'INSERT',schema:'public',table:'player_roles',filter:'game_id=eq.'+gameId}, payload => {
      if (payload.new.player_id === localStorage.getItem(identityKey(gameId))) void loadMyRole();
    });
  // Subscribe before the initial reads so we cannot miss a game-start event.
  channel.subscribe(status => {
    if (status === 'SUBSCRIBED') {
      // Also resynchronises after a dropped connection or a suspended phone.
      void loadGameConfig();
      void loadPlayers();
    }
  });
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

function updateCounts() {
  $('werewolf-count').textContent = werewolfCount;
  $('villager-count').textContent = Math.max(0, playerCount - werewolfCount);
  $('wolf-minus').disabled = werewolfCount <= 1;
  $('wolf-plus').disabled = werewolfCount >= 50;
  const valid = playerCount > werewolfCount;
  $('start-game').disabled = !isHost || !valid || starting || gameStatus !== 'lobby';
  $('start-status').textContent = starting ? 'Assigning roles…' : gameStatus !== 'lobby' ? 'Game already started.' : !isHost ? 'Only the host can start the game.' : !valid ? 'Waiting for more players.' : 'Ready to start.';
  $('role-warning').hidden = valid;
  $('role-warning').textContent = valid ? '' : 'Add more players than werewolves before starting.';
}
async function loadGameConfig() {
  if (!currentGame) return;
  const {data,error} = await db.from('games').select('werewolf_count,status').eq('id',currentGame).single();
  if (error) {showError(error.message);return;}
  werewolfCount = data.werewolf_count;
  gameStatus = data.status;
  updateCounts();
  if (gameStatus === 'playing') await loadMyRole();
}
async function changeWerewolves(delta) {
  if (!isHost || !currentGame) return;
  const next = Math.min(50,Math.max(1,werewolfCount+delta));
  if (next === werewolfCount) return;
  $('wolf-minus').disabled = $('wolf-plus').disabled = true;
  const {error} = await db.from('games').update({werewolf_count:next}).eq('id',currentGame);
  if (error) showError(error.message);
  await loadGameConfig();
}
$('wolf-minus').addEventListener('click',()=>changeWerewolves(-1));
$('wolf-plus').addEventListener('click',()=>changeWerewolves(1));


async function loadMyRole() {
  if (!currentGame) return;
  const playerId = localStorage.getItem(identityKey(currentGame));
  if (!playerId) return;
  const {data,error} = await db.from('player_roles').select('role').eq('game_id',currentGame).eq('player_id',playerId).maybeSingle();
  if (error) {showError(error.message);return;}
  if (!data) {
    if (gameStatus === 'playing') {
      showRole();
      $('role-name').textContent='Assigning roles…';
      $('role-description').textContent='Please wait a moment.';
    }
    return;
  }
  showRole();
  $('role-name').textContent=data.role==='werewolf'?'Werewolf':'Villager';
  $('role-description').textContent=data.role==='werewolf'?'You are a werewolf. Keep your identity hidden.':'You are a villager. Find the werewolves.';
}
function shuffle(players) {
  const result=[...players];
  for(let i=result.length-1;i>0;i--){
    const random=new Uint32Array(1);
    crypto.getRandomValues(random);
    const j=random[0]%(i+1);
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}
async function startGame() {
  if (!isHost || !currentGame || starting || gameStatus!=='lobby') return;
  starting=true;updateCounts();showError('');
  try {
    const {data:game,error:gameError}=await db.from('games').select('werewolf_count,status').eq('id',currentGame).single();
    if(gameError) throw gameError;
    if(game.status!=='lobby') throw new Error('Game already started.');
    const {data:players,error:playerError}=await db.from('players').select('id').eq('game_id',currentGame);
    if(playerError) throw playerError;
    if(players.length<=game.werewolf_count) throw new Error('You need more players than werewolves.');
    const assigned=shuffle(players).map((player,index)=>({player_id:player.id,game_id:currentGame,role:index<game.werewolf_count?'werewolf':'villager'}));
    const {error:roleError}=await db.from('player_roles').insert(assigned);
    if(roleError) throw roleError;
    const {data:updated,error:updateError}=await db.from('games').update({status:'playing'}).eq('id',currentGame).eq('status','lobby').select('id');
    if(updateError) throw updateError;
    if(!updated.length) throw new Error('Game was already started.');
    await loadGameConfig();
  } catch(e) {showError(e.message||'Could not start the game.');}
  finally {starting=false;updateCounts();}
}
$('start-game').addEventListener('click',startGame);

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
