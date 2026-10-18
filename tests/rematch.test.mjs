import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { StateEngine } from '../src/state-engine.js';
import { GameController } from '../src/game-controller.js';
import { GameRepository } from '../src/game-repository.js';
import { GameState } from '../src/game-state.js';

const finished = (changes = {}) => ({
  id: 'old-game', status: 'finished', hostPlayerId: 'host', winner: 'village',
  players: [{ id:'host', name:'Host', eliminated_at:null },
    { id:'out', name:'Out', eliminated_at:'yesterday' }],
  ...changes
});

test('only the current host can start a rematch of a finished game', () => {
  const rules = new StateEngine();
  const host = { playerId:'host',isHost:true };
  assert.equal(rules.can(finished(), 'START_REMATCH', host), true);
  assert.equal(rules.can(finished(), 'START_REMATCH', { playerId:'out',isHost:false }), false);
  assert.equal(rules.can(finished({rematchGameId:'next'}), 'START_REMATCH', host), false);
  assert.equal(rules.can(finished({status:'playing'}), 'START_REMATCH', host), false);
  assert.equal(rules.can(finished({hostPlayerId:'out'}), 'START_REMATCH', host), false);
  assert.equal(rules.can(finished(), 'CAST_DAY_VOTE', host), false);
});

test('rematch link is an immutable part of each game state snapshot', () => {
  const old = new GameState({id:'old-game',status:'finished'});
  const next = old.with({rematchGameId:'new-game'});
  assert.equal(old.rematchGameId,null);
  assert.equal(next.rematchGameId,'new-game');
  assert.ok(Object.isFrozen(next));
});

test('repository delegates rematch initiation and identity lookup to database RPCs', async () => {
  const calls = [];
  const repository = new GameRepository({
    rpc: async (name,args) => {
      calls.push({name,args});
      return {data: name === 'start_game_rematch' ? 'new-game'
        : {game_id:'new-game',player_id:'new-player',session_generation:0,name:'Fiona'},
      error:null};
    }
  });
  assert.equal(await repository.startRematch('old-game','host'),'new-game');
  assert.deepEqual(await repository.getRematchIdentity('old-game','out'),{
    game_id:'new-game',player_id:'new-player',session_generation:0,name:'Fiona'
  });
  assert.deepEqual(calls, [
    {name:'start_game_rematch',args:{p_game_id:'old-game',p_host:'host'}},
    {name:'get_game_rematch_identity',args:{p_game_id:'old-game',p_player_id:'out'}}
  ]);
});

test('eliminated and living players each return to their original name in the new lobby', async () => {
  for (const {oldId,newId,name,eliminated} of [
    {oldId:'out',newId:'fresh-out',name:'Fiona',eliminated:true},
    {oldId:'host',newId:'fresh-host',name:'Host',eliminated:false}
  ]) {
    const controller = Object.create(GameController.prototype);
    controller.state = finished({ rematchGameId:'new-game' });
    controller.playerId = oldId;
    controller.eliminated = eliminated;
    controller.rematchJoining = false;
    const persisted = [];
    controller.session = {
      testFrame:false, savePlayer:(...args)=>persisted.push(args), name:''
    };
    controller.repository = {
      getRematchIdentity: async () => ({
        game_id:'new-game',player_id:newId,session_generation:0,name
      })
    };
    let entered;
    controller.enterGame = async (gameId, playerId) => {
      entered=[gameId,playerId]; controller.state={id:gameId,status:'lobby'};
      controller.eliminated=false;
    };
    await controller.followRematch(controller.state);
    assert.deepEqual(entered,['new-game',newId]);
    assert.deepEqual(persisted,[['new-game',newId,0]]);
    assert.equal(controller.session.name,name);
    assert.equal(controller.eliminated,false);
    assert.equal(controller.rematchJoining,false);
  }
});

test('test-harness frames follow rematches without colliding in shared local storage',async () => {
  const controller=Object.create(GameController.prototype);
  controller.state=finished({rematchGameId:'new-game'});
  controller.playerId='out'; controller.rematchJoining=false;
  controller.session={testFrame:true,savePlayer:()=>assert.fail('shared storage'),name:'Original'};
  controller.repository={getRematchIdentity:async()=>({
    game_id:'new-game',player_id:'fresh-out',session_generation:0,name:'Fiona'
  })};
  controller.enterGame=async()=>{controller.state={id:'new-game',status:'lobby'};};
  await controller.followRematch(controller.state);
  assert.equal(controller.session.name,'Original');
});

test('rematch controls live on the endgame screen, not in the old home link', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const screens=readFileSync(new URL('../src/screens.js',import.meta.url),'utf8');
  const controller=readFileSync(new URL('../src/game-controller.js',import.meta.url),'utf8');
  assert.match(html,/<button id="start-rematch" type="button" hidden>New Game<\/button>/);
  assert.match(html,/id="rematch-waiting"/);
  assert.match(screens,/\$\('start-rematch'\)\.addEventListener\('click'/);
  assert.match(screens,/\$\('start-rematch'\)\.hidden = !isHost/);
  assert.match(screens,/id === 'endgame-screen'/);
  assert.match(controller,/state\.rematchGameId/);
  assert.match(controller,/this\.followRematch\(state\)/);
  assert.doesNotMatch(controller,/this\.session\.clearActive\(id\)/);
});

test('migration provides a new game and maps exactly one identity per old player',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261018_game_rematch.sql',import.meta.url),'utf8');
  assert.match(sql,/create unique index if not exists players_rematch_previous_unique/);
  assert.match(sql,/v_old\.status <> 'finished'/);
  assert.match(sql,/for v_player in/);
  assert.match(sql,/old\.rematch_game_id|v_old\.rematch_game_id/);
  assert.match(sql,/session_generation/);
});
