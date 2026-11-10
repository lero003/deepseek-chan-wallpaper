import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, advanceGame, command, setFocus, setMovement, requestAction, gameUI } from '../src/fighters/game.ts';
import { spawnEnemy } from '../src/fighters/enemy-brain.ts';
import { damageHero } from '../src/fighters/combat.ts';
import { enterPhase } from '../src/fighters/director.ts';
import { seedFromText } from '../src/world/world.ts';
import { canStand, moveOnFloor } from '../src/fighters/movement.ts';
import { HERO, LIMITS, RUN_SECTIONS, STAGE_WIDTH } from '../src/fighters/definitions.ts';

const make = seed => createGame(seedFromText(seed ?? 'fighters-run'));
const ticks = (g, count) => { for (let i = 0; i < count; i++) advanceGame(g, 1 / 60); };
function arena() {
  const g = make(); command(g, 'play'); setFocus(g, true); enterPhase(g, 'battle');
  g.graceUntil = 0; return g;
}
function manualBot(g) {
  const target = g.enemies.filter(e => e.hp > 0 && e.state !== 'exit').sort((a,b) =>
    Math.hypot(a.x-g.hero.x,(a.y-g.hero.y)*3)-Math.hypot(b.x-g.hero.x,(b.y-g.hero.y)*3))[0];
  if (!target) { setMovement(g, 1, 0); return; }
  const dx = target.x-g.hero.x, dy = target.y-g.hero.y;
  setMovement(g, Math.abs(dx)>42?Math.sign(dx):0, Math.abs(dy)>7?Math.sign(dy):0);
  if (Math.abs(dx)<70 && Math.abs(dy)<16 && g.combatTick%9===0) requestAction(g,'attack');
  if (g.hero.gauge>=100) requestAction(g,'special');
  if (target.state==='windup' && Math.abs(dx)<80 && g.combatTick>=g.hero.dodgeReadyAt) requestAction(g,'dodge');
}

test('the default scene stays quiet for three to five minutes with the existing home position', () => {
  const g = make();
  assert.equal(g.mode,'auto'); assert.equal(g.phase,'rest'); assert.equal(g.cameraX,120);
  assert.ok(g.nextEventAt>=170*60 && g.nextEventAt<=280*60);
  ticks(g,160*60); assert.equal(g.phase,'rest'); assert.equal(g.stats.episodes,0);
});
test('encounter off preserves quiet life indefinitely without enemies or projectiles', () => {
  const g=make(); command(g,'frequency','off'); ticks(g,1800*60);
  assert.equal(g.stats.episodes,0); assert.equal(g.phase,'rest'); assert.equal(g.enemies.length,0);
});
test('input is ignored in auto, without focus, and while paused', () => {
  const g=make(); requestAction(g,'attack'); setMovement(g,1,1); assert.equal(g.hero.attackQueue,0);
  command(g,'play'); requestAction(g,'attack'); assert.equal(g.hero.attackQueue,0);
  setFocus(g,true); requestAction(g,'attack'); assert.equal(g.hero.attackQueue,1);
  command(g,'pause'); requestAction(g,'attack'); assert.equal(g.hero.attackQueue,0);
});
test('focus loss releases movement and refocus adds a grace second', () => {
  const g=arena(); setFocus(g,true); setMovement(g,1,1); requestAction(g,'attack'); setFocus(g,false);
  const x=g.hero.x, before=g.combatTick; ticks(g,120);
  assert.equal(g.hero.x,x); assert.equal(g.combatTick,before);
  setFocus(g,true); assert.equal(g.graceUntil,g.combatTick+60);
});
test('three buffered taps execute exactly a three-part combo', () => {
  const g=arena(); const enemy=spawnEnemy(g,'boss',0,g.hero.x+30,g.hero.y,-1,false); enemy.readyAt=1e9;
  requestAction(g,'attack'); requestAction(g,'attack'); requestAction(g,'attack');
  const seen=new Set(); for(let i=0;i<100;i++){advanceGame(g,1/60);if(g.hero.state==='attack')seen.add(g.hero.combo);}
  assert.deepEqual([...seen],[1,2,3]); assert.equal(g.hero.attackId,3); assert.equal(enemy.hp,30-6);
});
test('a different ground lane makes a near attack miss', () => {
  const g=arena(); g.hero.y=218; const enemy=spawnEnemy(g,'slime',0,g.hero.x+30,250,-1,false); enemy.readyAt=1e9;
  requestAction(g,'attack'); ticks(g,30); assert.equal(enemy.hp,3); assert.equal(g.stats.hits,0);
});
test('dodge has invulnerability and a cooldown, and the special spends a full gauge', () => {
  const g=arena(); requestAction(g,'dodge'); ticks(g,1); const hp=g.hero.hp;
  damageHero(g,g.hero.x+10); assert.equal(g.hero.hp,hp); assert.equal(g.stats.dodges,1);
  const enemy=spawnEnemy(g,'boss',0,g.hero.x+40,g.hero.y,-1,false); enemy.readyAt=1e9;
  g.hero.gauge=100; requestAction(g,'special'); ticks(g,36);
  assert.equal(enemy.hp,27); assert.equal(g.stats.specials,1); assert.ok(g.hero.gauge<100);
});
test('stage bounds and furniture constrain feet across the full route', () => {
  const g=arena(); const p={x:100,y:235};
  for(let i=0;i<2000;i++)moveOnFloor(p,2,0,g.stage);
  assert.equal(p.x,g.stage.bounds.right); assert.equal(g.stage.width,STAGE_WIDTH);
  assert.equal(canStand(g.stage,3200,235),true);
});
test('the manual run is a scrolling route: twelve sections, side entrances, boss finish', () => {
  const g=make(); command(g,'play'); setFocus(g,true);
  const phases=new Set(), areas=new Set(); let sideSpawns=0; const seen=new Set();
  const started=g.tick; let elapsed=0;
  for(let i=0;i<600*60 && g.phase!=='result' && g.phase!=='retry';i++){
    manualBot(g); advanceGame(g,1/60); elapsed=g.tick-started;
    phases.add(g.phase);
    areas.add(gameUI(g).areaName);
    for(const enemy of g.enemies){
      if(seen.has(enemy.id))continue; seen.add(enemy.id);
      if(enemy.state==='enter') sideSpawns++;
    }
  }
  assert.equal(g.phase,'result');
  assert.equal(g.outcome,'win');
  assert.equal(g.stats.sections, RUN_SECTIONS.length);
  assert.ok(phases.has('boss'));
  assert.ok(sideSpawns>=8,'enemies must walk in from the screen edges');
  assert.ok(areas.size>=3,'the run must cross several areas');
  assert.ok(g.cameraX<=130);
  assert.ok(elapsed/60>110 && elapsed/60<330,`full run should take about three minutes (${(elapsed/60).toFixed(1)}s)`);
});
test('manual defeat retries from the current section with a full health bar', () => {
  const g=arena(); g.hero.hp=0; g.mode='manual'; ticks(g,1);
  assert.equal(g.phase,'retry'); assert.equal(g.outcome,'loss');
  const section=g.section; command(g,'retry');
  assert.equal(g.phase,'battle'); assert.equal(g.section,section); assert.equal(g.hero.hp,HERO.hp);
  assert.equal(g.sectionLocked,false);
});
test('auto runs a shorter route, clears it, and returns home without watchdog shortcuts', () => {
  const g=make(); command(g,'demo'); const phases=new Set();
  for(let i=0;i<200*60&&g.phase!=='rest';i++){advanceGame(g,1/60);phases.add(g.phase);}
  assert.equal(g.phase,'rest'); assert.equal(g.stats.wins,1); assert.equal(g.stats.recoveries,0);
  assert.ok(phases.has('boss')); assert.equal(gameUI(g).mode,'auto');
});
test('handing control to a wallpaper event promotes it to the full manual route', () => {
  const g=make(); command(g,'demo'); ticks(g,320);
  command(g,'play'); setFocus(g,true);
  assert.equal(g.mode,'manual'); assert.equal(g.route,'full');
  assert.equal(g.enemies.length>0,true);
});
test('return to wallpaper clears combat and keeps encounter preferences', () => {
  const g=make(); command(g,'play'); command(g,'frequency','off'); setFocus(g,true); ticks(g,30);
  command(g,'home');
  assert.equal(g.mode,'auto'); assert.equal(g.phase,'rest'); assert.equal(g.frequency,'off');
  assert.equal(g.enemies.length,0); assert.equal(g.cameraX,0);
});
test('the auto hard deadline guarantees return from a stalled route', () => {
  const g=make(); command(g,'demo'); g.eventStartedAt=-LIMITS.autoSeconds*60; ticks(g,600);
  assert.equal(g.phase,'rest'); assert.ok(g.stats.recoveries>=1);
});
test('thirty-minute 15/30/60fps simulations are identical and bounded', () => {
  const results=[];
  for(const fps of [15,30,60]){
    const g=make('long-wallpaper');for(let i=0;i<1800*fps;i++)advanceGame(g,1/fps);
    assert.ok(g.stats.episodes>=2);
    assert.ok(g.stats.maxEnemies<=LIMITS.enemies);
    assert.ok(g.stats.maxProjectiles<=LIMITS.projectiles);
    assert.ok(g.stats.maxEffects<=LIMITS.effects);
    results.push(g);
  }
  assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
});
test('resume gaps are bounded and invalid commands are rejected', () => {
  const g=make();const initial=JSON.stringify(g);for(const value of [NaN,Infinity,-1,0])advanceGame(g,value);assert.equal(JSON.stringify(g),initial);
  advanceGame(g,600);assert.equal(g.tick,15);
  assert.throws(()=>command(g,'frequency','endless'));assert.throws(()=>command(g,'exec','anything'));
});
