import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGame, advanceGame, command, setFocus } from '../src/fighters/game.ts';
import { gamePlan, orderedActors } from '../src/fighters/render-plan.ts';
import { sceneryQuads, STAGE_RIGHT } from '../src/fighters/scenery.ts';
import { spawnEnemy } from '../src/fighters/enemy-brain.ts';
import { enterPhase, startEpisode } from '../src/fighters/director.ts';
import { create as nativeBridge } from '../src/app-mac/native-bridge.ts';
import { parseAtlas } from '../src/render/atlas.ts';
import { SceneRenderer } from '../src/render/renderer.ts';
import { motesFor, scenePlan } from '../src/render/scene-plan.ts';
import { PLACEHOLDER_LAYOUT, SUNSET_LAYOUT } from '../src/art/scene-profiles.ts';
import { STAGE_WIDTH } from '../src/fighters/definitions.ts';
import { seedFromText } from '../src/world/world.ts';

const atlas=parseAtlas(JSON.parse(await readFile(new URL('../assets/character/atlas.json',import.meta.url),'utf8')));
const make=()=>createGame(seedFromText('fighters-run'));
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const item of Object.values(value))freeze(item);}return value;}

test('quiet home keeps the exact accepted-scene frame and original layout commands',()=>{
  const g=make(), expected=scenePlan(g.world,atlas,motesFor(g.world.seed),PLACEHOLDER_LAYOUT);
  const actual=gamePlan(g,atlas,PLACEHOLDER_LAYOUT);
  for(const key of ['tick','state','x','floorY','facing','frame','quads'])assert.deepEqual(actual[key],expected[key],key);
  assert.equal(actual.battle,undefined);assert.deepEqual(actual.overlay,[]);
});
test('manual preview never leaks a HUD or combat actors onto the passive wallpaper',()=>{
  const g=make();command(g,'play');setFocus(g,true);advanceGame(g,.25);
  const preview=gamePlan(g,atlas,PLACEHOLDER_LAYOUT), wallpaper=gamePlan(g,atlas,PLACEHOLDER_LAYOUT,true,'wallpaper');
  assert.ok(preview.battle);assert.equal(wallpaper.battle,undefined);assert.equal(wallpaper.overlay,undefined);
  const original=scenePlan(g.world,atlas,motesFor(g.world.seed),PLACEHOLDER_LAYOUT);
  assert.deepEqual(wallpaper.quads,original.quads);
});
test('actors draw by ground depth, and the heroine wins same-depth ties',()=>{
  const g=make();command(g,'play');setFocus(g,true);enterPhase(g,'battle');
  const rear=spawnEnemy(g,'popup',0,g.hero.x+50,250,1,false);
  const front=spawnEnemy(g,'slime',0,g.hero.x-50,225,-1,false);
  const same=spawnEnemy(g,'slime',0,g.hero.x+4,g.hero.y,-1,false);
  const order=orderedActors(g).map(a=>a.kind==='hero'?'hero':a.id);
  assert.deepEqual(order,[front.id,same.id,'hero',rear.id]);
  const battle=gamePlan(g,atlas,PLACEHOLDER_LAYOUT).battle;
  assert.ok(battle&&battle.commands.length>80);
});
test('the whole 3600px route is painted, with no gaps over the accepted photo',()=>{
  for(const layout of [PLACEHOLDER_LAYOUT,SUNSET_LAYOUT]){
    const quads=sceneryQuads(layout);
    assert.ok(quads.length>1200);
    for(const quad of quads){
      assert.match(quad.color,/^#[0-9a-f]{6}$/i);
      assert.ok(quad.alpha>0&&quad.alpha<=1);
      assert.ok(quad.x>=0&&quad.x+quad.width<=STAGE_RIGHT);
      assert.ok(quad.y>=0&&quad.y+quad.height<=270);
      assert.ok(quad.x+quad.width<=120||quad.x>=600,'the centre photo must remain untouched');
    }
    for(const [x,y] of [[724,10],[900,60],[1200,120],[1435,10],[1600,160],[1900,210],[2400,60],[2600,260],[3000,120],[3595,10],[3595,160],[3595,210],[3595,260]]){
      assert.ok(quads.some(quad=>quad.x<=x&&quad.x+quad.width>=x&&quad.y<=y&&quad.y+quad.height>=y),`coverage at ${x},${y}`);
    }
  }
  assert.equal(STAGE_RIGHT,STAGE_WIDTH);
});
test('the Canvas host applies per-quad alpha instead of painting every scenery layer opaque',()=>{
  const calls=[];
  const fakeCanvas=()=>{
    const ctx={globalAlpha:1,fillStyle:'',imageSmoothingEnabled:false,
      fillRect(x,y,w,h){calls.push({x,y,w,h,alpha:this.globalAlpha,color:this.fillStyle});},
      setTransform(){},globalAlpha:1,fillStyle:'',
      drawImage(){},save(){},restore(){},translate(){},scale(){},rotate(){},fillText(){},set font(_){},get font(){return '';},set textBaseline(_){}};
    return {width:0,height:0,getContext:()=>ctx};
  };
  const previous=globalThis.document;
  globalThis.document={createElement:()=>fakeCanvas()};
  try{
    const g=make();command(g,'play');setFocus(g,true);advanceGame(g,.5);
    const renderer=new SceneRenderer(fakeCanvas(),{background:null,character:null},atlas,1,SUNSET_LAYOUT);
    renderer.resize(480,270);
    renderer.drawPlan(gamePlan(g,atlas,SUNSET_LAYOUT));
    const translucent=sceneryQuads(SUNSET_LAYOUT).filter(quad=>quad.alpha<.9);
    assert.ok(translucent.length>0);
    for(const quad of translucent.slice(0,6)){
      assert.ok(calls.some(call=>call.color===quad.color&&Math.abs(call.alpha-quad.alpha)<1e-6),`alpha ${quad.alpha} for ${quad.color}`);
    }
  }finally{
    if(previous===undefined)Reflect.deleteProperty(globalThis,'document');else globalThis.document=previous;
  }
});
test('the legacy long route still builds a boss battle plan with ambience and no dialogue bubbles',()=>{
  const g=make();startEpisode(g,'auto');
  let sawBoss=false;
  for(let i=0;i<200*60&&g.phase!=='rest';i++){
    advanceGame(g,1/60);
    if(g.phase==='boss'){sawBoss=true;break;}
  }
  assert.ok(sawBoss,'the long route still reaches the boss (manual/legacy route, not the wallpaper incident)');
  const plan=gamePlan(g,atlas,SUNSET_LAYOUT);
  assert.ok(plan.battle&&plan.battle.commands.length>220);
  assert.ok(plan.battle.commands.filter(item=>item.kind==='rect'&&item.alpha<.2).length>40,'animated ambience must be present');
  assert.equal(g.effects.some(item=>item.kind==='words'),false);
  for(const item of plan.battle.commands){
    assert.ok(Number.isFinite(item.x)&&Number.isFinite(item.y)&&Number.isFinite(item.alpha));
    if(item.kind==='sprite')assert.ok(item.frame>=0&&item.frame<16);
    if(item.kind==='text')assert.ok(item.size>=5&&item.size<=24);
  }
});
test('the bundled bridge produces the same run, plan and scenery as the direct Web core',()=>{
  const bridge=nativeBridge(JSON.stringify({atlas,layout:PLACEHOLDER_LAYOUT,stage:{width:STAGE_WIDTH}}),'fighters-run');
  const g=make();
  bridge.commandJSON('demo');command(g,'demo');
  for(let i=0;i<900;i++){bridge.advanceGameJSON(1/30);advanceGame(g,1/30);}
  assert.deepEqual(JSON.parse(bridge.gameJSON()),g);
  assert.deepEqual(JSON.parse(bridge.gameSnapshotJSON()),gamePlan(g,atlas,PLACEHOLDER_LAYOUT));
  assert.deepEqual(JSON.parse(bridge.gameSnapshotJSON(true,'wallpaper')),gamePlan(g,atlas,PLACEHOLDER_LAYOUT,true,'wallpaper'));
  assert.deepEqual(JSON.parse(bridge.sceneryJSON()),sceneryQuads(PLACEHOLDER_LAYOUT));
  assert.throws(()=>bridge.gameSnapshotJSON(true,'foreground-stealing'));
  assert.throws(()=>bridge.replayGameJSON(1000001,1/60));
});

test('automatic wallpaper incidents stay inside the accepted study room',()=>{
  const g=make();
  let guard=0;
  while(g.route!=='room'&&guard<400*60){advanceGame(g,1/60);guard++;}
  assert.equal(g.route,'room','the quiet life eventually raises a room incident');
  let battleGuard=0;
  while(g.phase!=='battle'&&battleGuard<30*60){advanceGame(g,1/60);battleGuard++;}
  assert.equal(g.phase,'battle');
  assert.equal(g.cameraX,0,'a room incident never scrolls the camera');
  assert.ok(g.hero.x>=0&&g.hero.x<=480,'the heroine stays in the accepted room');
  for(const enemy of g.enemies)assert.ok(enemy.x>=0&&enemy.x<=480,'visitors stay in the accepted room');
  const plan=gamePlan(g,atlas,SUNSET_LAYOUT);
  assert.ok(plan.battle);
  assert.equal(plan.battle.room,true,'the renderer keeps the study backdrop');
  assert.equal(plan.battle.cameraX,0);
  assert.equal(plan.battle.commands.some(item=>item.kind==='text'),false,'no chapter banner or HUD over the wallpaper');
  assert.ok(plan.battle.commands.some(item=>item.kind==='sprite'),'the room incident still draws the characters');
  const wallpaper=gamePlan(g,atlas,SUNSET_LAYOUT,true,'wallpaper');
  assert.equal(wallpaper.battle?.room,true,'the wallpaper itself shows the small incident');
  const started=g.tick;
  let endGuard=0;
  while(g.phase!=='rest'&&endGuard<60*60){advanceGame(g,1/60);endGuard++;}
  assert.equal(g.phase,'rest','the incident always returns to the quiet room');
  assert.ok(g.tick-started<60*60,'the incident is short enough to watch');
});
